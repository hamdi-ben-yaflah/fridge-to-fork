import json

from langchain.messages import AIMessage, HumanMessage

from app.chef.domain.events import MealProposed, ReplyDelta
from app.chef.domain.model import ChatMessage, ChatRequest, Image, Meal, MealSummary
from app.chef.infrastructure.translation import (
    ChefTurnOutput,
    MealOutput,
    ReplyStream,
    safe_url,
    to_chef_turn,
    to_messages,
)

PNG = Image(data=b"\x89PNG", media_type="image/png")


def test_https_url_is_kept() -> None:
    assert safe_url("https://example.com/r") == "https://example.com/r"


def test_non_http_scheme_is_dropped() -> None:
    assert safe_url("javascript:alert(1)") is None


def test_missing_url_stays_missing() -> None:
    assert safe_url(None) is None


def test_user_and_chef_messages_keep_their_order_and_roles() -> None:
    request = ChatRequest(
        history=(
            ChatMessage(role="user", text="eggs, rice"),
            ChatMessage(role="chef", text="Try egg fried rice."),
            ChatMessage(role="user", text="Make it vegan"),
        )
    )

    messages = to_messages(request)

    assert [type(m) for m in messages] == [HumanMessage, AIMessage, HumanMessage]
    assert [m.text for m in messages] == [
        "eggs, rice",
        "Try egg fried rice.",
        "Make it vegan",
    ]


def test_chef_meals_are_summarised_after_the_reply() -> None:
    request = ChatRequest(
        history=(
            ChatMessage(role="user", text="eggs, tomato"),
            ChatMessage(
                role="chef",
                text="Two ideas.",
                meals=(
                    MealSummary("Shakshuka", ("eggs", "tomato"), ("feta",)),
                    MealSummary("Omelette", ("eggs",), ()),
                ),
            ),
            ChatMessage(role="user", text="The second one, spicier"),
        )
    )

    chef_message = to_messages(request)[1]

    assert chef_message.text == (
        "Two ideas.\n"
        "Proposed: Shakshuka (uses eggs, tomato; needs feta)\n"
        "Proposed: Omelette (uses eggs)"
    )


def test_image_is_attached_to_the_latest_user_message_only() -> None:
    request = ChatRequest(
        history=(
            ChatMessage(role="user", text="eggs"),
            ChatMessage(role="chef", text="What else?"),
            ChatMessage(role="user", text="this", has_photo=True),
        ),
        image=PNG,
    )

    messages = to_messages(request)

    image_blocks = [
        [block for block in m.content_blocks if block["type"] == "image"]
        for m in messages
    ]
    assert [len(blocks) for blocks in image_blocks] == [0, 0, 1]
    assert messages[2].text == "this"


def test_earlier_photos_become_a_marker() -> None:
    request = ChatRequest(
        history=(
            ChatMessage(role="user", text="", has_photo=True),
            ChatMessage(role="chef", text="I see eggs and spinach."),
            ChatMessage(role="user", text="Something quick"),
        )
    )

    assert to_messages(request)[0].text == "(shared a photo)"


def test_photo_only_latest_message_gets_a_prompt_text() -> None:
    request = ChatRequest(history=(ChatMessage(role="user", text=""),), image=PNG)

    assert to_messages(request)[0].text == "Here is a photo of my ingredients."


def _meal_output(name: str, source_url: str | None = None) -> MealOutput:
    return MealOutput(
        name=name,
        ingredients_used=["eggs"],
        missing_ingredients=[],
        steps=["Cook"],
        source_url=source_url,
    )


def test_output_maps_to_a_chef_turn() -> None:
    output = ChefTurnOutput(
        reply="One idea.",
        meals=[_meal_output("Omelette", "https://example.com/o")],
        quick_replies=["Make it vegan"],
    )

    turn = to_chef_turn(output)

    assert turn.reply == "One idea."
    assert [meal.name for meal in turn.meals] == ["Omelette"]
    assert turn.meals[0].source_url == "https://example.com/o"
    assert turn.quick_replies == ("Make it vegan",)


def test_output_is_capped_and_cleaned() -> None:
    output = ChefTurnOutput(
        reply="Lots.",
        meals=[_meal_output(f"Meal {i}", "javascript:alert(1)") for i in range(7)],
        quick_replies=[" Vegan ", "", "  ", "Quick", "Cheap", "Spicy", "Mild"],
    )

    turn = to_chef_turn(output)

    assert len(turn.meals) == 5
    assert all(meal.source_url is None for meal in turn.meals)
    assert turn.quick_replies == ("Vegan", "Quick", "Cheap", "Spicy")


def test_reply_text_streams_as_deltas() -> None:
    stream = ReplyStream()

    events = [
        stream.feed('{"reply": "One'),
        stream.feed(" idea"),
        stream.feed('.", "meals": ['),
    ]

    assert events == [[ReplyDelta("One")], [ReplyDelta(" idea")], [ReplyDelta(".")]]


def test_non_json_text_streams_nothing() -> None:
    assert ReplyStream().feed("Let me look that up") == []


def _meal_json(name: str) -> str:
    return json.dumps(_meal_output(name, "https://example.com/r").model_dump())


def test_a_meal_streams_once_the_next_one_starts() -> None:
    stream = ReplyStream()
    stream.feed('{"reply": "Two.", "meals": [')
    stream.feed(_meal_json("Omelette"))

    events = stream.feed(', {"name": "Shak')

    assert events == [
        MealProposed(
            Meal(
                name="Omelette",
                ingredients_used=("eggs",),
                missing_ingredients=(),
                steps=("Cook",),
                source_url="https://example.com/r",
            )
        )
    ]


def test_the_last_meal_streams_once_quick_replies_start() -> None:
    stream = ReplyStream()
    stream.feed('{"reply": "One.", "meals": [')
    stream.feed(_meal_json("Omelette"))

    events = stream.feed('], "quick_replies": ["Veg')

    assert [event.meal.name for event in events if isinstance(event, MealProposed)] == [
        "Omelette"
    ]


def test_streamed_meals_are_capped_like_the_final_reply() -> None:
    meals = ", ".join(_meal_json(f"Meal {i}") for i in range(7))

    events = ReplyStream().feed(f'{{"reply": "Lots.", "meals": [{meals}], "quick_')

    assert len([event for event in events if isinstance(event, MealProposed)]) == 5


def test_only_the_latest_user_message_ends_with_a_cache_breakpoint() -> None:
    request = ChatRequest(
        history=(
            ChatMessage(role="user", text="eggs, rice"),
            ChatMessage(role="chef", text="Try egg fried rice."),
            ChatMessage(role="user", text="Make it vegan"),
        )
    )

    messages = to_messages(request)

    breakpoints = [
        [block.get("cache_control") for block in m.content if isinstance(block, dict)]
        for m in messages
    ]
    assert breakpoints == [[None], [], [{"type": "ephemeral"}]]


def test_the_cache_breakpoint_comes_after_the_photo() -> None:
    request = ChatRequest(history=(ChatMessage(role="user", text="this"),), image=PNG)

    blocks = to_messages(request)[0].content

    assert [block["type"] for block in blocks if isinstance(block, dict)] == [
        "image",
        "text",
    ]
    assert isinstance(blocks[-1], dict)
    assert blocks[-1]["cache_control"] == {"type": "ephemeral"}
