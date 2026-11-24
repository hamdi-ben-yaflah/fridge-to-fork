from dataclasses import dataclass
from typing import Literal

from app.chef.domain.errors import (
    EmptyRequestError,
    ImageTooLargeError,
    InvalidConversationError,
    UnsupportedImageTypeError,
)

MAX_IMAGE_BYTES = 7 * 1024 * 1024
SUPPORTED_IMAGE_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/gif"}
)


@dataclass(frozen=True)
class Image:
    data: bytes
    media_type: str

    def __post_init__(self) -> None:
        if self.media_type not in SUPPORTED_IMAGE_TYPES:
            raise UnsupportedImageTypeError(self.media_type)
        if len(self.data) > MAX_IMAGE_BYTES:
            raise ImageTooLargeError(len(self.data))


@dataclass(frozen=True)
class Meal:
    name: str
    ingredients_used: tuple[str, ...]
    missing_ingredients: tuple[str, ...]
    steps: tuple[str, ...]
    source_url: str | None


@dataclass(frozen=True)
class MealSummary:
    name: str
    ingredients_used: tuple[str, ...]
    missing_ingredients: tuple[str, ...]


@dataclass(frozen=True)
class ChatMessage:
    role: Literal["user", "chef"]
    text: str
    has_photo: bool = False
    meals: tuple[MealSummary, ...] = ()


@dataclass(frozen=True)
class ChatRequest:
    history: tuple[ChatMessage, ...]
    image: Image | None = None

    def __post_init__(self) -> None:
        if not self.history or self.history[-1].role != "user":
            raise InvalidConversationError()
        if self.image is None and not self.history[-1].text.strip():
            raise EmptyRequestError()


@dataclass(frozen=True)
class ChefTurn:
    reply: str
    meals: tuple[Meal, ...]
    quick_replies: tuple[str, ...]
