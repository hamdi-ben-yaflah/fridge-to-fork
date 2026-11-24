import json
from collections.abc import Mapping
from typing import Any

from langchain.messages import AIMessage, ToolMessage
from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field

from app.chef.domain.events import WebSearchFinished, WebSearchStarted

SEARCH_TOOL_NAME = "search_recipes"


class SearchRecipesInput(BaseModel):
    query: str = Field(description="Web search query for recipes.")
    status: str = Field(
        description=(
            "One sentence shown to the user while you search, in your warm voice, "
            "saying what you are looking for and why it suits them. At most 70 "
            "characters. Example: Hunting for a cozy fried rice for your leftover rice"
        )
    )


def search_recipes_tool(search: BaseTool) -> BaseTool:
    # `status` is only read from the tool call, by to_search_events, for the UI.
    async def search_recipes(
        query: str,
        status: str,  # noqa: ARG001
    ) -> tuple[str, list[str]]:
        output = await search.ainvoke({"query": query})
        if isinstance(output, str):
            return output, []
        urls = [result["url"] for result in output.get("results", [])]
        return json.dumps(output, default=str), urls

    return StructuredTool.from_function(
        coroutine=search_recipes,
        name=SEARCH_TOOL_NAME,
        description="Search the web for recipes.",
        args_schema=SearchRecipesInput,
        response_format="content_and_artifact",
    )


def to_search_events(
    update: Mapping[str, Any],
) -> list[WebSearchStarted | WebSearchFinished]:
    events: list[WebSearchStarted | WebSearchFinished] = []
    for node_update in update.values():
        for message in (node_update or {}).get("messages", []):
            if isinstance(message, AIMessage):
                events.extend(
                    WebSearchStarted(status=call["args"]["status"])
                    for call in message.tool_calls
                    if call["name"] == SEARCH_TOOL_NAME
                )
            elif isinstance(message, ToolMessage) and message.name == SEARCH_TOOL_NAME:
                events.append(WebSearchFinished(urls=tuple(message.artifact or ())))
    return events
