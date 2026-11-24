import base64
import os

import pytest

from app.chef.domain.events import ChefReplied
from app.chef.domain.model import ChatMessage, ChatRequest, Image
from app.chef.infrastructure.langchain_chef import LangChainChef
from app.core.config import settings

pytestmark = [
    pytest.mark.anyio,
    pytest.mark.skipif(
        not (
            os.environ.get("RUN_PAID_TESTS") == "1"
            and settings.ANTHROPIC_API_KEY
            and settings.TAVILY_API_KEY
        ),
        reason="paid API test: set RUN_PAID_TESTS=1 and ANTHROPIC_API_KEY/TAVILY_API_KEY",
    ),
]


def _chef() -> LangChainChef:
    assert settings.ANTHROPIC_API_KEY and settings.TAVILY_API_KEY
    return LangChainChef(settings.ANTHROPIC_API_KEY, settings.TAVILY_API_KEY)


async def test_ingredients_message_ends_with_a_reply_with_meals() -> None:
    request = ChatRequest(
        history=(
            ChatMessage(
                role="user", text="3 eggs, a cup of cooked rice, half an onion"
            ),
        )
    )

    events = [event async for event in _chef().stream(request)]

    last = events[-1]
    assert isinstance(last, ChefReplied)
    assert len(last.turn.meals) >= 1


_ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


async def test_photo_message_is_accepted_by_the_model() -> None:
    request = ChatRequest(
        history=(ChatMessage(role="user", text=""),),
        image=Image(data=_ONE_PIXEL_PNG, media_type="image/png"),
    )

    events = [event async for event in _chef().stream(request)]

    assert isinstance(events[-1], ChefReplied)
