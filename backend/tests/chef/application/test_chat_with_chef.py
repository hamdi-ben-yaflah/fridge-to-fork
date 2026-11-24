import pytest

from app.chef.application.chat_with_chef import ChatWithChef
from app.chef.domain.events import ChefEvent, ChefReplied, WebSearchStarted
from app.chef.domain.model import ChatMessage, ChatRequest, ChefTurn, Meal
from tests.chef.fakes import FakeChef


@pytest.mark.anyio
async def test_yields_chef_events_in_order_for_the_request() -> None:
    meal = Meal(
        name="Egg fried rice",
        ingredients_used=("eggs", "rice"),
        missing_ingredients=("soy sauce",),
        steps=("Fry rice", "Add eggs"),
        source_url="https://example.com/egg-fried-rice",
    )
    events: list[ChefEvent] = [
        WebSearchStarted(status="Looking for a quick egg fried rice"),
        ChefReplied(
            turn=ChefTurn(
                reply="Here is one idea.",
                meals=(meal,),
                quick_replies=("Make it vegan",),
            )
        ),
    ]
    chef = FakeChef(events)
    request = ChatRequest(history=(ChatMessage(role="user", text="eggs, rice"),))

    received = [event async for event in ChatWithChef(chef).execute(request)]

    assert received == events
    assert chef.received == request
