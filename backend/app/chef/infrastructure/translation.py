import base64
import json
from typing import Any

from langchain.messages import AIMessage, HumanMessage
from langchain_core.utils.json import parse_partial_json
from pydantic import BaseModel

from app.chef.domain.events import MealProposed, ReplyDelta
from app.chef.domain.model import (
    ChatMessage,
    ChatRequest,
    ChefTurn,
    Image,
    Meal,
    MealSummary,
)

MAX_MEALS = 5
MAX_QUICK_REPLIES = 4


class MealOutput(BaseModel):
    name: str
    ingredients_used: list[str]
    missing_ingredients: list[str]
    steps: list[str]
    source_url: str | None


class ChefTurnOutput(BaseModel):
    reply: str
    meals: list[MealOutput]
    quick_replies: list[str]


def safe_url(url: str | None) -> str | None:
    if url is not None and url.startswith(("http://", "https://")):
        return url
    return None


def to_messages(request: ChatRequest) -> list[HumanMessage | AIMessage]:
    *earlier, latest = request.history
    return [
        *(_to_message(message, None) for message in earlier),
        _to_message(latest, request.image, cache_breakpoint=True),
    ]


def _to_message(
    message: ChatMessage, image: Image | None, cache_breakpoint: bool = False
) -> HumanMessage | AIMessage:
    if message.role == "chef":
        text = message.text
        if message.meals:
            meal_summaries = [_proposed(meal) for meal in message.meals]
            text = "\n".join([text] + meal_summaries)
        return AIMessage(content=text)
    text = message.text
    if message.has_photo and image is None:
        text = f"{text}\n(shared a photo)".strip()
    if image is not None and not text.strip():
        text = "Here is a photo of my ingredients."
    blocks: list[str | dict[str, Any]] = []
    if image is not None:
        blocks.append(
            {
                "type": "image",
                "base64": base64.b64encode(image.data).decode(),
                "mime_type": image.media_type,
            }
        )
    text_block: dict[str, Any] = {"type": "text", "text": text}
    if cache_breakpoint:
        # Caches everything up to this turn's question: the agent's later calls in
        # this turn and the next turn's request both start with the same prefix.
        text_block["cache_control"] = {"type": "ephemeral"}
    blocks.append(text_block)
    return HumanMessage(content=blocks)


def _proposed(meal: MealSummary) -> str:
    details = []
    if meal.ingredients_used:
        details.append(f"uses {', '.join(meal.ingredients_used)}")
    if meal.missing_ingredients:
        details.append(f"needs {', '.join(meal.missing_ingredients)}")
    if not details:
        return f"Proposed: {meal.name}"
    return f"Proposed: {meal.name} ({'; '.join(details)})"


def to_chef_turn(output: ChefTurnOutput) -> ChefTurn:
    replies = [reply.strip() for reply in output.quick_replies if reply.strip()]
    return ChefTurn(
        reply=output.reply,
        meals=tuple(_to_meal(meal) for meal in output.meals[:MAX_MEALS]),
        quick_replies=tuple(replies[:MAX_QUICK_REPLIES]),
    )


def _to_meal(meal: MealOutput) -> Meal:
    return Meal(
        name=meal.name,
        ingredients_used=tuple(meal.ingredients_used),
        missing_ingredients=tuple(meal.missing_ingredients),
        steps=tuple(meal.steps),
        source_url=safe_url(meal.source_url),
    )


class ReplyStream:
    def __init__(self) -> None:
        self._json = ""
        self._sent_text = ""
        self._sent_meals = 0

    def feed(self, chunk: str) -> list[ReplyDelta | MealProposed]:
        self._json += chunk
        try:
            partial = parse_partial_json(self._json)
        except json.JSONDecodeError:
            return []
        events: list[ReplyDelta | MealProposed] = []
        reply = partial.get("reply", "")
        if len(reply) > len(self._sent_text):
            events.append(ReplyDelta(reply[len(self._sent_text) :]))
            self._sent_text = reply
        meals = partial.get("meals", [])
        finished = (meals if "quick_replies" in partial else meals[:-1])[:MAX_MEALS]
        for meal in finished[self._sent_meals :]:
            events.append(MealProposed(_to_meal(MealOutput.model_validate(meal))))
        self._sent_meals = max(self._sent_meals, len(finished))
        return events
