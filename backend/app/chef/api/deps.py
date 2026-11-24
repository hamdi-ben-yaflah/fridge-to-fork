from functools import lru_cache
from typing import Annotated

from fastapi import Depends, File, Form, HTTPException, UploadFile, status
from langchain_core.tracers import LangChainTracer
from langsmith import Client
from pydantic import ValidationError

from app.chef.api.schemas import Conversation
from app.chef.application.chat_with_chef import ChatWithChef
from app.chef.domain.errors import (
    EmptyRequestError,
    ImageTooLargeError,
    InvalidConversationError,
    UnsupportedImageTypeError,
)
from app.chef.domain.model import MAX_IMAGE_BYTES, ChatRequest, Image
from app.chef.domain.ports import Chef
from app.chef.infrastructure.langchain_chef import LangChainChef
from app.core.config import settings

INVALID_CONVERSATION = "Invalid conversation."


async def get_chat_request(
    messages: Annotated[str, Form(max_length=100_000)],
    image: Annotated[UploadFile | None, File()] = None,
) -> ChatRequest:
    try:
        history = Conversation.validate_json(messages)
    except ValidationError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=INVALID_CONVERSATION,
        )
    domain_image = await _read_image(image)
    try:
        return ChatRequest(
            history=tuple(message.to_domain() for message in history),
            image=domain_image,
        )
    except InvalidConversationError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=INVALID_CONVERSATION,
        )
    except EmptyRequestError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Describe your ingredients or upload a photo of them.",
        )


async def _read_image(image: UploadFile | None) -> Image | None:
    if image is None:
        return None
    data = await image.read(MAX_IMAGE_BYTES + 1)
    if not data:
        return None
    try:
        return Image(data=data, media_type=image.content_type or "")
    except UnsupportedImageTypeError:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Upload a JPEG, PNG, WebP or GIF image.",
        )
    except ImageTooLargeError:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Images must be 7 MB or smaller.",
        )


def get_chef() -> Chef:
    if not (settings.ANTHROPIC_API_KEY and settings.TAVILY_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The chef is not configured.",
        )
    return _langchain_chef(
        settings.ANTHROPIC_API_KEY,
        settings.TAVILY_API_KEY,
        settings.LANGSMITH_API_KEY,
    )


@lru_cache
def _langchain_chef(
    anthropic_api_key: str, tavily_api_key: str, langsmith_api_key: str | None
) -> LangChainChef:
    tracer = None
    if langsmith_api_key:
        client = Client(
            api_key=langsmith_api_key,
            api_url=settings.LANGSMITH_ENDPOINT or None,
        )
        tracer = LangChainTracer(project_name=settings.LANGSMITH_PROJECT, client=client)
    return LangChainChef(anthropic_api_key, tavily_api_key, tracer=tracer)


def get_chat_with_chef(chef: Annotated[Chef, Depends(get_chef)]) -> ChatWithChef:
    return ChatWithChef(chef)


ChatRequestDep = Annotated[ChatRequest, Depends(get_chat_request)]
ChatWithChefDep = Annotated[ChatWithChef, Depends(get_chat_with_chef)]
