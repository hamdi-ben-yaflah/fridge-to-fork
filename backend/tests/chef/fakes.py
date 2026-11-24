from collections.abc import AsyncIterator

from app.chef.domain.events import ChefEvent
from app.chef.domain.model import ChatRequest


class FakeChef:
    def __init__(self, events: list[ChefEvent], error: Exception | None = None) -> None:
        self._events = events
        self._error = error
        self.received: ChatRequest | None = None

    async def stream(self, request: ChatRequest) -> AsyncIterator[ChefEvent]:
        self.received = request
        for event in self._events:
            yield event
        if self._error is not None:
            raise self._error
