import asyncio
from collections.abc import AsyncIterator, Mapping
from typing import Any

from langchain.agents import create_agent
from langchain.messages import AIMessageChunk, AnyMessage
from langchain_anthropic import ChatAnthropic
from langchain_core.runnables import RunnableConfig
from langchain_core.tracers import LangChainTracer
from langchain_tavily import TavilySearch
from pydantic import SecretStr

from app.chef.domain.errors import SuggestionFailedError
from app.chef.domain.events import ChefEvent, ChefReplied
from app.chef.domain.model import ChatRequest
from app.chef.infrastructure.recipe_search import search_recipes_tool, to_search_events
from app.chef.infrastructure.translation import (
    ChefTurnOutput,
    ReplyStream,
    to_chef_turn,
    to_messages,
)

CHEF_PROMPT = """\
You are a friendly master chef chatting with someone who wants to cook with the
ingredients they already have. They describe ingredients in text, a photo, or both.

- If you cannot tell what ingredients they have, ask one short question instead of guessing.
- Search the web only when you propose new meals. Answer cooking questions directly.
- When you propose meals, propose 3 to 5 that use as many of their ingredients as
  possible and need few or no missing ones. For each give the ingredients it uses from
  their list, the ingredients they would still need, short steps, and the URL of the
  recipe you based it on (or null).
- Allergies, diets and equipment limits the user mentions are hard constraints for the
  rest of the conversation.
- When they ask to change meals you proposed, return the updated meals.
- When the turn is a question or an answer without new meals, return no meals.
- reply: 1 to 3 short sentences. Do not repeat the meal details in it.
- quick_replies: 2 to 4 short next steps the user might say, written in their voice,
  each at most 40 characters, for example "Make it vegan", "Under 20 minutes", "No oven".
"""


class LangChainChef:
    def __init__(
        self,
        anthropic_api_key: str,
        tavily_api_key: str,
        model: str = "claude-sonnet-5-5",
        tracer: LangChainTracer | None = None,
    ) -> None:
        self._config: RunnableConfig = {
            "recursion_limit": 12,
            "run_name": "chef_turn",
            "callbacks": [tracer] if tracer else [],
        }
        search = search_recipes_tool(
            TavilySearch(max_results=5, tavily_api_key=tavily_api_key)
        )
        # ChatAnthropic's stubs mark the aliased timeout/stop fields as required though they default to None
        chat_model = ChatAnthropic(  # type: ignore[call-arg]
            model_name=model,
            api_key=SecretStr(anthropic_api_key),
            max_tokens=16000,
            timeout=60,
        )
        self._agent = create_agent(
            model=chat_model,
            tools=[search],
            system_prompt=CHEF_PROMPT,
            response_format=ChefTurnOutput,
        )

    async def stream(self, request: ChatRequest) -> AsyncIterator[ChefEvent]:
        final_state: Mapping[str, Any] = {}
        messages: list[AnyMessage | dict[str, Any]] = [*to_messages(request)]
        reply_stream = ReplyStream()
        streamed_message_id: str | None = None
        try:
            async with asyncio.timeout(120):
                async for chunk in self._agent.astream(
                    {"messages": messages},
                    config=self._config,
                    stream_mode=["updates", "values", "messages"],
                    version="v2",
                ):
                    if chunk["type"] == "updates":
                        for event in to_search_events(chunk["data"]):
                            yield event
                    elif chunk["type"] == "values":
                        final_state = chunk["data"]
                    elif chunk["type"] == "messages":
                        token, _ = chunk["data"]
                        if not isinstance(token, AIMessageChunk) or not token.text:
                            continue
                        if token.id != streamed_message_id:
                            reply_stream = ReplyStream()
                            streamed_message_id = token.id
                        for reply_event in reply_stream.feed(token.text):
                            yield reply_event
            turn = to_chef_turn(final_state["structured_response"])
        except Exception as error:
            raise SuggestionFailedError() from error
        yield ChefReplied(turn=turn)
