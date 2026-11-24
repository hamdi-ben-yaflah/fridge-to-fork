import logging
from collections.abc import AsyncIterable
from urllib.parse import urlparse

from fastapi import APIRouter, Depends
from fastapi.sse import EventSourceResponse, ServerSentEvent

from app.api.deps import get_current_user
from app.chef.api.deps import ChatRequestDep, ChatWithChefDep
from app.chef.api.schemas import (
    ErrorPayload,
    MealPayload,
    ReplyDeltaPayload,
    ReplyPayload,
    StatusPayload,
)
from app.chef.domain.errors import SuggestionFailedError
from app.chef.domain.events import (
    ChefReplied,
    MealProposed,
    ReplyDelta,
    WebSearchFinished,
    WebSearchStarted,
)

logger = logging.getLogger(__name__)

MAX_LISTED_SITES = 3

router = APIRouter(
    prefix="/chef", tags=["chef"], dependencies=[Depends(get_current_user)]
)


@router.post("/chat", response_class=EventSourceResponse)
async def chat(
    request: ChatRequestDep, use_case: ChatWithChefDep
) -> AsyncIterable[ServerSentEvent]:
    try:
        async for event in use_case.execute(request):
            match event:
                case WebSearchStarted(status=status):
                    status_payload = StatusPayload(message=status)
                    yield ServerSentEvent(
                        data=status_payload.model_dump(mode="json"), event="status"
                    )
                case WebSearchFinished(urls=urls):
                    status_payload = StatusPayload(message=_found_message(urls))
                    yield ServerSentEvent(
                        data=status_payload.model_dump(mode="json"), event="status"
                    )
                case ReplyDelta(text=text):
                    delta_payload = ReplyDeltaPayload(text=text)
                    yield ServerSentEvent(
                        data=delta_payload.model_dump(mode="json"), event="reply_delta"
                    )
                case MealProposed(meal=meal):
                    meal_payload = MealPayload.from_domain(meal)
                    yield ServerSentEvent(
                        data=meal_payload.model_dump(mode="json"), event="meal"
                    )
                case ChefReplied(turn=turn):
                    reply_payload = ReplyPayload.from_domain(turn)
                    yield ServerSentEvent(
                        data=reply_payload.model_dump(mode="json"), event="reply"
                    )
    except SuggestionFailedError:
        logger.exception("Chef chat failed")
        error_payload = ErrorPayload(
            detail="The chef could not come up with meals right now. Please try again."
        )
        yield ServerSentEvent(data=error_payload.model_dump(mode="json"), event="error")
        return
    yield ServerSentEvent(data={}, event="done")


def _found_message(urls: tuple[str, ...]) -> str:
    if not urls:
        return "No recipes found for that search"
    sites = dict.fromkeys(
        (urlparse(url).hostname or "").removeprefix("www.") for url in urls
    )
    names = [site for site in sites if site]
    listed = ", ".join(names[:MAX_LISTED_SITES])
    more = " and more" if len(names) > MAX_LISTED_SITES else ""
    return f"Found {len(urls)} recipes on {listed}{more}"
