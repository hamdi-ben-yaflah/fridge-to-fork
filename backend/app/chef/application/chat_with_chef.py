from collections.abc import AsyncIterator

from app.chef.domain.events import ChefEvent
from app.chef.domain.model import ChatRequest
from app.chef.domain.ports import Chef


class ChatWithChef:
    def __init__(self, chef: Chef) -> None:
        self._chef = chef

    def execute(self, request: ChatRequest) -> AsyncIterator[ChefEvent]:
        return self._chef.stream(request)
