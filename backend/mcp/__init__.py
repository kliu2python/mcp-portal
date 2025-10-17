"""Utilities for wiring Model Context Protocol agents in the backend."""

from .agent import stream_agent_events
from .config import build_mcp_config, parse_additional_mcp_servers

__all__ = [
    "build_mcp_config",
    "parse_additional_mcp_servers",
    "stream_agent_events",
]
