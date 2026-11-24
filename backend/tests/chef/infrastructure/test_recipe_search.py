from typing import Any

import pytest
from langchain.messages import AIMessage, ToolMessage
from langchain_core.tools import BaseTool

from app.chef.domain.events import WebSearchFinished, WebSearchStarted
from app.chef.infrastructure.recipe_search import search_recipes_tool, to_search_events


class FakeTavily(BaseTool):
    name: str = "tavily_search"
    description: str = "fake"
    output: object

    def _run(self, query: str) -> object:
        return self.output

    async def _arun(self, query: str) -> object:
        return self.output


async def _search(output: object) -> ToolMessage:
    tool = search_recipes_tool(FakeTavily(output=output))
    message: ToolMessage = await tool.ainvoke(
        {
            "type": "tool_call",
            "id": "1",
            "name": "search_recipes",
            "args": {"query": "egg fried rice", "status": "Looking for rice"},
        }
    )
    return message


def test_search_call_starts_with_the_chefs_status_line() -> None:
    update = {
        "model": {
            "messages": [
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "id": "1",
                            "name": "search_recipes",
                            "args": {
                                "query": "egg fried rice recipe",
                                "status": "Looking for a quick egg fried rice",
                            },
                        }
                    ],
                )
            ]
        }
    }

    assert to_search_events(update) == [
        WebSearchStarted(status="Looking for a quick egg fried rice")
    ]


def test_other_tool_calls_are_not_searches() -> None:
    update = {
        "model": {
            "messages": [
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "id": "1",
                            "name": "ChefTurnOutput",
                            "args": {"reply": "Hi", "meals": [], "quick_replies": []},
                        }
                    ],
                )
            ]
        }
    }

    assert to_search_events(update) == []


def test_search_result_finishes_with_the_urls_found() -> None:
    update = {
        "tools": {
            "messages": [
                ToolMessage(
                    content="...",
                    tool_call_id="1",
                    name="search_recipes",
                    artifact=["https://a.com/r", "https://b.com/r"],
                )
            ]
        }
    }

    assert to_search_events(update) == [
        WebSearchFinished(urls=("https://a.com/r", "https://b.com/r"))
    ]


def test_failed_search_finishes_with_no_urls() -> None:
    update = {
        "tools": {
            "messages": [
                ToolMessage(
                    content="Error: timed out",
                    tool_call_id="1",
                    name="search_recipes",
                    status="error",
                )
            ]
        }
    }

    assert to_search_events(update) == [WebSearchFinished(urls=())]


@pytest.mark.anyio
async def test_search_returns_results_to_the_model_and_urls_as_artifact() -> None:
    results: dict[str, Any] = {
        "results": [
            {"url": "https://a.com/r", "title": "A", "content": "Fry the rice"},
            {"url": "https://b.com/r", "title": "B", "content": "Beat the eggs"},
        ]
    }

    message = await _search(results)

    assert "Fry the rice" in message.text
    assert message.artifact == ["https://a.com/r", "https://b.com/r"]


@pytest.mark.anyio
async def test_search_error_text_reaches_the_model_with_no_urls() -> None:
    message = await _search("No search results found for 'egg fried rice'.")

    assert message.text == "No search results found for 'egg fried rice'."
    assert message.artifact == []


@pytest.mark.anyio
async def test_search_failure_reaches_the_model_with_no_urls() -> None:
    message = await _search({"error": TimeoutError("Tavily timed out")})

    assert "Tavily timed out" in message.text
    assert message.artifact == []
