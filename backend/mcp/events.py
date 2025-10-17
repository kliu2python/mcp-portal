from __future__ import annotations

from typing import Any, Optional, Sequence

from langchain_core.messages import BaseMessage


def truncate_text(text: str, limit: int = 160) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def extract_first_text(value: Any, preferred_keys: Sequence[str] = ()) -> Optional[str]:
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, dict):
        if preferred_keys:
            for key in preferred_keys:
                candidate = extract_first_text(value.get(key), preferred_keys)
                if candidate:
                    return candidate
        for key in value:
            candidate = extract_first_text(value[key], preferred_keys)
            if candidate:
                return candidate
        return None
    if isinstance(value, (list, tuple, set)):
        for item in value:
            candidate = extract_first_text(item, preferred_keys)
            if candidate:
                return candidate
        return None
    if isinstance(value, BaseMessage):
        return extract_first_text(value.content, preferred_keys)
    if hasattr(value, "model_dump"):
        try:
            dumped = value.model_dump()
        except Exception:  # pragma: no cover - defensive
            dumped = None
        if dumped is not None:
            return extract_first_text(dumped, preferred_keys)
    if hasattr(value, "dict"):
        try:
            dumped = value.dict()
        except Exception:  # pragma: no cover - defensive
            dumped = None
        if dumped is not None:
            return extract_first_text(dumped, preferred_keys)
    return None


def prepare_stream_event(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): prepare_stream_event(val) for key, val in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [prepare_stream_event(item) for item in value]
    if isinstance(value, BaseMessage):
        return {"type": value.type, "content": prepare_stream_event(value.content)}
    if hasattr(value, "model_dump"):
        try:
            dumped = value.model_dump()
        except Exception:  # pragma: no cover - defensive
            dumped = None
        if dumped is not None:
            return prepare_stream_event(dumped)
    if hasattr(value, "dict"):
        try:
            dumped = value.dict()
        except Exception:  # pragma: no cover - defensive
            dumped = None
        if dumped is not None:
            return prepare_stream_event(dumped)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def should_skip_stream_event(event: dict[str, Any]) -> bool:
    event_type = str(event.get("event") or "")
    if event_type != "on_chat_model_stream":
        return False

    data = event.get("data")
    if not isinstance(data, dict):
        return False

    chunk = data.get("chunk")
    if isinstance(chunk, dict):
        chunk_type = chunk.get("type")
        if isinstance(chunk_type, str) and chunk_type == "AIMessageChunk":
            return True
    elif isinstance(chunk, str) and chunk == "AIMessageChunk":
        return True

    chunk_type = data.get("chunk_type")
    if isinstance(chunk_type, str) and chunk_type == "AIMessageChunk":
        return True

    return False


def summarize_stream_event(event: dict[str, Any]) -> tuple[str, Optional[str]]:
    event_type = str(event.get("event") or "")
    event_name = str(event.get("name") or "")
    data = event.get("data")
    snippet = extract_first_text(
        data,
        (
            "message",
            "output",
            "observation",
            "text",
            "content",
            "input",
            "prompt",
            "tool_input",
            "tool_output",
            "result",
        ),
    )
    label_parts: list[str] = []
    if event_type:
        label_parts.append(event_type.replace("_", " ").title())
    if event_name:
        label_parts.append(event_name)
    message = " · ".join(label_parts) if label_parts else "Agent event"
    if snippet:
        message = f"{message}: {truncate_text(snippet)}"

    result_text: Optional[str] = None
    if event_type == "on_chain_end":
        preferred_output = None
        if isinstance(data, dict):
            preferred_output = extract_first_text(
                data.get("output"),
                ("output", "message", "text", "content", "result"),
            )
        if preferred_output:
            result_text = truncate_text(preferred_output, limit=400)
        else:
            fallback = extract_first_text(data)
            if fallback:
                result_text = truncate_text(fallback, limit=400)

    return message, result_text
