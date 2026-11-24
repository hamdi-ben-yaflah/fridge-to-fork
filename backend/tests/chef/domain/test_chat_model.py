import pytest

from app.chef.domain.errors import EmptyRequestError, InvalidConversationError
from app.chef.domain.model import ChatMessage, ChatRequest, Image


def test_conversation_ending_with_a_user_message_is_valid() -> None:
    history = (
        ChatMessage(role="user", text="eggs, rice"),
        ChatMessage(role="chef", text="Try egg fried rice."),
        ChatMessage(role="user", text="Make it vegan"),
    )

    request = ChatRequest(history=history)

    assert request.history == history
    assert request.image is None


def test_empty_conversation_is_rejected() -> None:
    with pytest.raises(InvalidConversationError):
        ChatRequest(history=())


def test_conversation_ending_with_the_chef_is_rejected() -> None:
    with pytest.raises(InvalidConversationError):
        ChatRequest(
            history=(
                ChatMessage(role="user", text="eggs"),
                ChatMessage(role="chef", text="Try an omelette."),
            )
        )


def test_blank_latest_message_without_photo_is_rejected() -> None:
    with pytest.raises(EmptyRequestError):
        ChatRequest(history=(ChatMessage(role="user", text="  \n"),))


def test_photo_only_latest_message_is_valid() -> None:
    image = Image(data=b"\x89PNG", media_type="image/png")

    request = ChatRequest(history=(ChatMessage(role="user", text=""),), image=image)

    assert request.image == image
