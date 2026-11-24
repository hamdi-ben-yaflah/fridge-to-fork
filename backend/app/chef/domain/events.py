from dataclasses import dataclass

from app.chef.domain.model import ChefTurn, Meal


@dataclass(frozen=True)
class WebSearchStarted:
    status: str


@dataclass(frozen=True)
class WebSearchFinished:
    urls: tuple[str, ...]


@dataclass(frozen=True)
class ReplyDelta:
    text: str


@dataclass(frozen=True)
class MealProposed:
    meal: Meal


@dataclass(frozen=True)
class ChefReplied:
    turn: ChefTurn


type ChefEvent = (
    WebSearchStarted | WebSearchFinished | ReplyDelta | MealProposed | ChefReplied
)
