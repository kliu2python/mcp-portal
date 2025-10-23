from __future__ import annotations

"""Runtime patches for third-party MCP helpers used by the backend."""

import logging
import os
from typing import Any

from langchain_core.tools import ToolException
from mcp.types import CallToolResult

logger = logging.getLogger(__name__)

_DEFAULT_TOOL_OUTPUT_LIMIT = 12_000
_NOTICE_TEMPLATE = (
    "\n\n[Output truncated to {limit} characters. Approximately {omitted} additional "
    "characters were omitted to stay within the model context window.]"
)


def _resolve_limit() -> int | None:
    """Resolve the maximum number of characters allowed from tool output."""
    raw_value = os.getenv("MCP_TOOL_OUTPUT_CHAR_LIMIT")
    if raw_value is None or raw_value.strip() == "":
        return _DEFAULT_TOOL_OUTPUT_LIMIT
    try:
        parsed = int(raw_value)
    except ValueError:
        logger.warning(
            "Invalid MCP_TOOL_OUTPUT_CHAR_LIMIT value %r. Falling back to default of %s characters.",
            raw_value,
            _DEFAULT_TOOL_OUTPUT_LIMIT,
        )
        return _DEFAULT_TOOL_OUTPUT_LIMIT
    if parsed <= 0:
        return None
    return parsed


def _safe_length(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, (bytes, bytearray)):
        return len(value)
    try:
        return len(value)
    except TypeError:
        return len(str(value))


def apply_mcp_use_patches() -> None:
    """Apply runtime patches that make the MCP client safer for large tool output."""
    from mcp_use.adapters.langchain_adapter import LangChainAdapter

    if getattr(LangChainAdapter, "_mcp_portal_tool_patch", False):
        return

    limit = _resolve_limit()
    original_parse = LangChainAdapter._parse_mcp_tool_result

    def _append_text(parts: list[str], text: str, remaining: int | None) -> tuple[int | None, int]:
        if not text:
            return remaining, 0
        if remaining is None:
            parts.append(text)
            return None, 0
        if remaining <= 0:
            return 0, len(text)
        length = len(text)
        if length <= remaining:
            parts.append(text)
            return remaining - length, 0
        parts.append(text[:remaining])
        return 0, length - remaining

    def _patched_parse(self, tool_result: CallToolResult) -> str:
        if tool_result.isError:
            raise ToolException(f"Tool execution failed: {tool_result.content}")

        if limit is None:
            return original_parse(self, tool_result)

        parts: list[str] = []
        omitted_total = 0
        remaining = limit

        for item in tool_result.content or []:
            item_type = getattr(item, "type", None)

            if item_type == "text":
                text_value = getattr(item, "text", "") or ""
                remaining, omitted = _append_text(parts, text_value, remaining)
                omitted_total += omitted
                continue

            if item_type == "image":
                approx_size = _safe_length(getattr(item, "data", None))
                placeholder = "[Image content omitted" + (
                    f" ({approx_size} bytes)]" if approx_size else "]"
                )
                remaining, omitted = _append_text(parts, placeholder, remaining)
                omitted_total += approx_size + omitted
                continue

            if item_type == "resource":
                resource = getattr(item, "resource", None)
                if resource is None:
                    continue
                text_value = getattr(resource, "text", None)
                if text_value:
                    remaining, omitted = _append_text(parts, text_value, remaining)
                    omitted_total += omitted
                    continue
                blob = getattr(resource, "blob", None)
                approx_size = _safe_length(blob)
                identifier = getattr(resource, "uri", None) or getattr(resource, "name", None) or "resource"
                placeholder = f"[Resource {identifier} omitted"
                if approx_size:
                    placeholder += f" ({approx_size} bytes)]"
                else:
                    placeholder += "]"
                remaining, omitted = _append_text(parts, placeholder, remaining)
                omitted_total += approx_size + omitted
                continue

            placeholder = f"[Content of type {item_type!s} omitted]"
            remaining, omitted = _append_text(parts, placeholder, remaining)
            omitted_total += omitted

        result = "".join(parts)
        if omitted_total > 0:
            notice = _NOTICE_TEMPLATE.format(limit=limit, omitted=omitted_total)
            if len(notice) >= limit:
                return notice[:limit]
            allowed_prefix = limit - len(notice)
            if len(result) > allowed_prefix:
                result = result[:allowed_prefix]
            result += notice
        return result

    LangChainAdapter._parse_mcp_tool_result = _patched_parse
    LangChainAdapter._mcp_portal_tool_patch = True

    logger.info(
        "Applied MCP tool output truncation patch%s.",
        " (disabled)" if limit is None else f" with limit {limit} characters",
    )

