from collections.abc import AsyncIterator
from typing import Protocol

from app.chef.domain.events import ChefEvent
from app.chef.domain.model import ChatRequest


class Chef(Protocol):
    def stream(self, request: ChatRequest) -> AsyncIterator[ChefEvent]: ...
