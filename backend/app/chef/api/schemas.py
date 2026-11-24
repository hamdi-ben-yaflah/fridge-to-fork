from typing import Annotated, Literal

from pydantic import BaseModel, Field, TypeAdapter

from app.chef.domain.model import ChatMessage, ChefTurn, Meal, MealSummary


class StatusPayload(BaseModel):
    message: str


class ReplyDeltaPayload(BaseModel):
    text: str


class MealPayload(BaseModel):
    name: str
    ingredients_used: list[str]
    missing_ingredients: list[str]
    steps: list[str]
    source_url: str | None

    @classmethod
    def from_domain(cls, meal: Meal) -> MealPayload:
        return cls(
            name=meal.name,
            ingredients_used=list(meal.ingredients_used),
            missing_ingredients=list(meal.missing_ingredients),
            steps=list(meal.steps),
            source_url=meal.source_url,
        )


class ReplyPayload(BaseModel):
    text: str
    meals: list[MealPayload]
    quick_replies: list[str]

    @classmethod
    def from_domain(cls, turn: ChefTurn) -> ReplyPayload:
        return cls(
            text=turn.reply,
            meals=[MealPayload.from_domain(meal) for meal in turn.meals],
            quick_replies=list(turn.quick_replies),
        )


class ErrorPayload(BaseModel):
    detail: str


class MealSummaryIn(BaseModel):
    name: str
    ingredients_used: list[str]
    missing_ingredients: list[str]


class ChatMessageIn(BaseModel):
    role: Literal["user", "chef"]
    text: str = Field(max_length=2000)
    has_photo: bool = False
    meals: list[MealSummaryIn] = Field(default=[], max_length=5)

    def to_domain(self) -> ChatMessage:
        return ChatMessage(
            role=self.role,
            text=self.text,
            has_photo=self.has_photo,
            meals=tuple(
                MealSummary(
                    name=meal.name,
                    ingredients_used=tuple(meal.ingredients_used),
                    missing_ingredients=tuple(meal.missing_ingredients),
                )
                for meal in self.meals
            ),
        )


Conversation: TypeAdapter[list[ChatMessageIn]] = TypeAdapter(
    Annotated[list[ChatMessageIn], Field(min_length=1, max_length=20)]
)
