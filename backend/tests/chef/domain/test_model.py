import pytest

from app.chef.domain.errors import (
    ImageTooLargeError,
    UnsupportedImageTypeError,
)
from app.chef.domain.model import MAX_IMAGE_BYTES, Image


def test_unsupported_image_type_is_rejected() -> None:
    with pytest.raises(UnsupportedImageTypeError):
        Image(data=b"%PDF", media_type="application/pdf")


def test_image_over_size_limit_is_rejected() -> None:
    with pytest.raises(ImageTooLargeError):
        Image(data=b"x" * (MAX_IMAGE_BYTES + 1), media_type="image/jpeg")


def test_image_at_size_limit_is_accepted() -> None:
    image = Image(data=b"x" * MAX_IMAGE_BYTES, media_type="image/jpeg")

    assert len(image.data) == MAX_IMAGE_BYTES


def test_seven_megabyte_phone_photo_is_accepted() -> None:
    photo = b"x" * (7 * 1024 * 1024)

    image = Image(data=photo, media_type="image/jpeg")

    assert image.data == photo
