import json
from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.chef.api.deps import get_chef
from app.chef.domain.errors import SuggestionFailedError
from app.chef.domain.events import (
    ChefEvent,
    ChefReplied,
    MealProposed,
    ReplyDelta,
    WebSearchFinished,
    WebSearchStarted,
)
from app.chef.domain.model import (
    MAX_IMAGE_BYTES,
    ChatMessage,
    ChefTurn,
    Meal,
    MealSummary,
)
from app.core.config import settings
from app.main import app
from app.models import User
from tests.chef.fakes import FakeChef

URL = f"{settings.API_V1_STR}/chef/chat"

MEAL = Meal(
    name="Egg fried rice",
    ingredients_used=("eggs", "rice"),
    missing_ingredients=("soy sauce",),
    steps=("Fry rice", "Add eggs"),
    source_url="https://example.com/egg-fried-rice",
)
MEAL_JSON = {
    "name": "Egg fried rice",
    "ingredients_used": ["eggs", "rice"],
    "missing_ingredients": ["soy sauce"],
    "steps": ["Fry rice", "Add eggs"],
    "source_url": "https://example.com/egg-fried-rice",
}
REPLIED = ChefReplied(
    turn=ChefTurn(reply="One idea.", meals=(MEAL,), quick_replies=("Make it vegan",))
)
USER_EGGS = {"role": "user", "text": "eggs, rice"}


def parse_sse(body: str) -> list[tuple[str, object]]:
    events: list[tuple[str, object]] = []
    for block in body.strip().split("\n\n"):
        fields = dict(
            line.split(": ", 1) for line in block.splitlines() if ": " in line
        )
        events.append((fields["event"], json.loads(fields["data"])))
    return events


@pytest.fixture
def use_fake() -> Generator[None]:
    app.dependency_overrides[get_current_user] = lambda: User(
        email="cook@example.com", hashed_password=""
    )
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_chef, None)


def install(events: list[ChefEvent], error: Exception | None = None) -> FakeChef:
    fake = FakeChef(events, error)
    app.dependency_overrides[get_chef] = lambda: fake
    return fake


def chat(client: TestClient, messages: list[dict[str, Any]], **kwargs: Any) -> Any:
    return client.post(URL, data={"messages": json.dumps(messages)}, **kwargs)


@pytest.mark.usefixtures("use_fake")
def test_chat_streams_status_reply_and_done(client: TestClient) -> None:
    install([WebSearchStarted(status="Looking for a quick egg fried rice"), REPLIED])

    response = chat(client, [USER_EGGS])

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert parse_sse(response.text) == [
        ("status", {"message": "Looking for a quick egg fried rice"}),
        (
            "reply",
            {
                "text": "One idea.",
                "meals": [MEAL_JSON],
                "quick_replies": ["Make it vegan"],
            },
        ),
        ("done", {}),
    ]


@pytest.mark.usefixtures("use_fake")
def test_reply_text_streams_before_the_final_reply(client: TestClient) -> None:
    install([ReplyDelta(text="One "), ReplyDelta(text="idea."), REPLIED])

    response = chat(client, [USER_EGGS])

    assert parse_sse(response.text)[:2] == [
        ("reply_delta", {"text": "One "}),
        ("reply_delta", {"text": "idea."}),
    ]


@pytest.mark.usefixtures("use_fake")
def test_each_meal_streams_before_the_final_reply(client: TestClient) -> None:
    install([MealProposed(meal=MEAL), REPLIED])

    response = chat(client, [USER_EGGS])

    assert parse_sse(response.text)[0] == ("meal", MEAL_JSON)


@pytest.mark.usefixtures("use_fake")
def test_finished_search_names_the_sites_it_found(client: TestClient) -> None:
    install(
        [
            WebSearchFinished(
                urls=(
                    "https://www.bbcgoodfood.com/recipes/egg-fried-rice",
                    "https://www.allrecipes.com/recipe/1",
                    "https://www.bbcgoodfood.com/recipes/special-fried-rice",
                )
            ),
            REPLIED,
        ]
    )

    response = chat(client, [USER_EGGS])

    assert parse_sse(response.text)[0] == (
        "status",
        {"message": "Found 3 recipes on bbcgoodfood.com, allrecipes.com"},
    )


@pytest.mark.usefixtures("use_fake")
def test_found_line_names_at_most_three_sites(client: TestClient) -> None:
    sites = ["a.com", "b.com", "c.com", "d.com", "e.com"]
    install(
        [WebSearchFinished(urls=tuple(f"https://{site}/r" for site in sites)), REPLIED]
    )

    response = chat(client, [USER_EGGS])

    assert parse_sse(response.text)[0] == (
        "status",
        {"message": "Found 5 recipes on a.com, b.com, c.com and more"},
    )


@pytest.mark.usefixtures("use_fake")
def test_empty_search_says_nothing_was_found(client: TestClient) -> None:
    install([WebSearchFinished(urls=()), REPLIED])

    response = chat(client, [USER_EGGS])

    assert parse_sse(response.text)[0] == (
        "status",
        {"message": "No recipes found for that search"},
    )


@pytest.mark.usefixtures("use_fake")
@pytest.mark.parametrize(
    "messages",
    [
        "not json",
        "[]",
        json.dumps([{"role": "waiter", "text": "hi"}]),
        json.dumps([USER_EGGS] * 21),
        json.dumps([{"role": "user", "text": "x" * 2001}]),
        json.dumps([USER_EGGS, {"role": "chef", "text": "Hi"}]),
    ],
    ids=["bad-json", "empty", "bad-role", "too-many", "too-long", "ends-with-chef"],
)
def test_invalid_conversation_is_rejected(client: TestClient, messages: str) -> None:
    fake = install([])

    response = client.post(URL, data={"messages": messages})

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid conversation."}
    assert fake.received is None


@pytest.mark.usefixtures("use_fake")
def test_blank_message_without_image_is_rejected(client: TestClient) -> None:
    install([])

    response = chat(client, [{"role": "user", "text": "   "}])

    assert response.status_code == 422
    assert response.json() == {
        "detail": "Describe your ingredients or upload a photo of them."
    }


@pytest.mark.usefixtures("use_fake")
def test_image_reaches_the_chef(client: TestClient) -> None:
    fake = install([REPLIED])

    chat(
        client,
        [{"role": "user", "text": ""}],
        files={"image": ("fridge.png", b"\x89PNG", "image/png")},
    )

    assert fake.received is not None
    assert fake.received.image is not None
    assert fake.received.image.data == b"\x89PNG"
    assert fake.received.image.media_type == "image/png"


@pytest.mark.usefixtures("use_fake")
def test_unsupported_image_type_is_rejected(client: TestClient) -> None:
    install([])

    response = chat(
        client,
        [USER_EGGS],
        files={"image": ("menu.pdf", b"%PDF", "application/pdf")},
    )

    assert response.status_code == 415


@pytest.mark.usefixtures("use_fake")
def test_oversized_image_is_rejected(client: TestClient) -> None:
    install([])
    too_big = b"x" * (MAX_IMAGE_BYTES + 1)

    response = chat(
        client, [USER_EGGS], files={"image": ("fridge.jpg", too_big, "image/jpeg")}
    )

    assert response.status_code == 413


@pytest.mark.usefixtures("use_fake")
def test_history_reaches_the_chef(client: TestClient) -> None:
    fake = install([REPLIED])

    chat(
        client,
        [
            {"role": "user", "text": "", "has_photo": True},
            {
                "role": "chef",
                "text": "One idea.",
                "meals": [MEAL_JSON],
            },
            {"role": "user", "text": "Make it vegan"},
        ],
    )

    assert fake.received is not None
    assert fake.received.history == (
        ChatMessage(role="user", text="", has_photo=True),
        ChatMessage(
            role="chef",
            text="One idea.",
            meals=(MealSummary("Egg fried rice", ("eggs", "rice"), ("soy sauce",)),),
        ),
        ChatMessage(role="user", text="Make it vegan"),
    )


BOUNDARY = "chef-boundary"
EMPTY_FILE_PART = (
    f"--{BOUNDARY}\r\n"
    'Content-Disposition: form-data; name="image"; filename=""\r\n'
    "Content-Type: application/octet-stream\r\n\r\n\r\n"
)


def messages_part(messages: list[dict[str, Any]]) -> str:
    return (
        f'--{BOUNDARY}\r\nContent-Disposition: form-data; name="messages"\r\n\r\n'
        f"{json.dumps(messages)}\r\n"
    )


def post_multipart(client: TestClient, parts: str) -> int:
    body = f"{parts}--{BOUNDARY}--\r\n".encode()
    response = client.post(
        URL,
        content=body,
        headers={"content-type": f"multipart/form-data; boundary={BOUNDARY}"},
    )
    return response.status_code


@pytest.mark.usefixtures("use_fake")
def test_empty_image_part_with_blank_text_is_rejected(client: TestClient) -> None:
    install([])

    status_code = post_multipart(
        client, EMPTY_FILE_PART + messages_part([{"role": "user", "text": ""}])
    )

    assert status_code == 422


@pytest.mark.usefixtures("use_fake")
def test_empty_image_part_with_text_is_ignored(client: TestClient) -> None:
    fake = install([REPLIED])

    status_code = post_multipart(client, EMPTY_FILE_PART + messages_part([USER_EGGS]))

    assert status_code == 200
    assert fake.received is not None
    assert fake.received.image is None


@pytest.mark.usefixtures("use_fake")
def test_upstream_failure_streams_error_event(client: TestClient) -> None:
    install(
        [WebSearchStarted(status="Looking for a quick egg fried rice")],
        error=SuggestionFailedError(),
    )

    response = chat(client, [USER_EGGS])

    assert response.status_code == 200
    assert parse_sse(response.text) == [
        ("status", {"message": "Looking for a quick egg fried rice"}),
        (
            "error",
            {
                "detail": "The chef could not come up with meals right now. Please try again."
            },
        ),
    ]


@pytest.mark.usefixtures("use_fake")
def test_missing_api_keys_returns_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(settings, "TAVILY_API_KEY", None)

    response = chat(client, [USER_EGGS])

    assert response.status_code == 503


@pytest.mark.usefixtures("use_fake")
def test_chat_requires_login(client: TestClient) -> None:
    install([REPLIED])
    app.dependency_overrides.pop(get_current_user)

    response = chat(client, [USER_EGGS])

    assert response.status_code == 401


@pytest.mark.usefixtures("use_fake")
def test_invalid_conversation_is_reported_before_a_bad_image(
    client: TestClient,
) -> None:
    install([])

    response = client.post(
        URL,
        data={"messages": "not json"},
        files={"image": ("menu.pdf", b"%PDF", "application/pdf")},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid conversation."}
