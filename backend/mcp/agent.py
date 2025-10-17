from __future__ import annotations

import json
import os
from typing import Any, AsyncIterator, Callable, Dict, Optional

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from mcp_use import MCPAgent, MCPClient

from .config import build_mcp_config
from .events import (
    prepare_stream_event,
    should_skip_stream_event,
    summarize_stream_event,
)

DEFAULT_SERVER_FALLBACK = "http://10.160.13.110:8882/sse"


def _create_llm(llm_settings: Optional[Dict[str, str]]) -> ChatOpenAI:
    if llm_settings:
        return ChatOpenAI(
            model=llm_settings["model_name"],
            base_url=llm_settings["base_url"],
            api_key=llm_settings["api_key"],
        )
    return ChatOpenAI(
        model=os.getenv("OPENAI_MODEL"),
        base_url=os.getenv("OPENAI_BASE_URL"),
        api_key=os.getenv("OPENAI_API_KEY"),
    )


async def stream_agent_events(
    task: str,
    server_url: Optional[str],
    llm_settings: Optional[Dict[str, str]],
    prompt_template: Optional[str],
    render_prompt: Callable[[str, Optional[str]], str],
) -> AsyncIterator[str]:
    """Stream JSON-encoded events from the MCP agent for a given task."""

    load_dotenv()

    resolved_server_url = server_url or os.getenv("MCP_SERVER_URL", DEFAULT_SERVER_FALLBACK)

    client = MCPClient.from_dict(build_mcp_config(resolved_server_url))
    llm = _create_llm(llm_settings)
    agent = MCPAgent(llm=llm, client=client, max_steps=30)

    final_prompt = render_prompt(task, prompt_template)

    yield json.dumps({"type": "info", "message": "Starting task execution."})

    final_result: Optional[str] = None
    try:
        async for raw_event in agent.stream_events(final_prompt, max_steps=30):
            safe_event = prepare_stream_event(raw_event)
            if should_skip_stream_event(safe_event):
                continue
            message, result_candidate = summarize_stream_event(safe_event)
            payload: Dict[str, Any] = {
                "type": "event",
                "message": message,
                "details": safe_event,
            }
            event_name = safe_event.get("event")
            if isinstance(event_name, str) and event_name:
                payload["eventName"] = event_name
            event_source = safe_event.get("name")
            if isinstance(event_source, str) and event_source:
                payload["eventSource"] = event_source
            yield json.dumps(payload)
            if result_candidate:
                final_result = result_candidate
    except Exception as exc:  # pragma: no cover - defensive
        yield json.dumps({"type": "error", "message": str(exc)})
        raise

    yield json.dumps({"type": "success", "message": "Task completed."})
    if final_result:
        yield json.dumps({"type": "result", "message": final_result})
    else:
        yield json.dumps({"type": "result", "message": "No final response returned."})
