from collections.abc import Generator

import pytest


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[None]:
    # Overrides the root autouse `db` fixture: chef tests never touch Postgres.
    yield


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
