from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def _normalise_server_mapping(raw: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    servers: Dict[str, Dict[str, Any]] = {}
    for name, definition in raw.items():
        if not isinstance(name, str):
            continue
        key = name.strip()
        if not key:
            continue

        if isinstance(definition, str):
            servers[key] = {"url": definition}
            continue

        if not isinstance(definition, dict):
            logger.debug(
                "Skipping MCP server '%s' because its definition is not an object.",
                key,
            )
            continue

        url = definition.get("url")
        if not isinstance(url, str) or not url:
            logger.warning(
                "Skipping MCP server '%s' because it does not include a string 'url'", key
            )
            continue

        servers[key] = definition

    return servers


def parse_additional_mcp_servers(raw_value: Optional[str]) -> Dict[str, Dict[str, Any]]:
    """Parse extra MCP server definitions from JSON configuration."""
    if not raw_value:
        return {}

    try:
        decoded = json.loads(raw_value)
    except json.JSONDecodeError:
        logger.warning(
            "Unable to parse MCP_ADDITIONAL_SERVERS value as JSON. The value will be ignored."
        )
        return {}

    if not isinstance(decoded, dict):
        logger.warning(
            "Expected MCP_ADDITIONAL_SERVERS to contain a JSON object mapping names to server"
            " definitions. The provided value will be ignored."
        )
        return {}

    return _normalise_server_mapping(decoded)


def _load_servers_from_file(path: Path) -> Dict[str, Dict[str, Any]]:
    try:
        raw_text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.warning(
            "MCP configuration file '%s' was not found. Falling back to environment variables.",
            path,
        )
        return {}
    except OSError as exc:
        logger.warning(
            "Unable to read MCP configuration file '%s': %s. Falling back to environment variables.",
            path,
            exc,
        )
        return {}

    try:
        decoded = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.warning(
            "Unable to parse MCP configuration file '%s' as JSON. The file will be ignored.",
            path,
        )
        return {}

    if not isinstance(decoded, dict):
        logger.warning(
            "Expected MCP configuration file '%s' to contain a JSON object.", path
        )
        return {}

    if "mcpServers" in decoded and isinstance(decoded["mcpServers"], dict):
        return _normalise_server_mapping(decoded["mcpServers"])

    return _normalise_server_mapping(decoded)


def build_mcp_config(primary_url: str) -> Dict[str, Any]:
    """Compose the MCP client configuration for the agent runner."""
    primary_name = os.getenv("MCP_PRIMARY_SERVER_NAME", "http")
    servers: Dict[str, Dict[str, Any]] = {}

    config_path = os.getenv("MCP_SERVERS_FILE")
    if config_path:
        resolved_path = Path(config_path).expanduser()
        servers.update(_load_servers_from_file(resolved_path))

    servers[primary_name] = {"url": primary_url}

    aliases_env = os.getenv("MCP_PRIMARY_SERVER_ALIASES", "")
    if aliases_env:
        for alias in aliases_env.split(","):
            alias_name = alias.strip()
            if alias_name and alias_name not in servers:
                servers[alias_name] = {"url": primary_url}

    gmail_otp_url = os.getenv("MCP_GMAIL_OTP_URL")
    if gmail_otp_url:
        gmail_otp_name = os.getenv("MCP_GMAIL_OTP_SERVER_NAME", "gmailOtp")
        servers[gmail_otp_name] = {"url": gmail_otp_url}

    additional_servers = parse_additional_mcp_servers(os.getenv("MCP_ADDITIONAL_SERVERS"))
    for name, definition in additional_servers.items():
        if name in servers:
            logger.info(
                "Overriding MCP server '%s' with definition from MCP_ADDITIONAL_SERVERS.",
                name,
            )
        servers[name] = definition

    return {"mcpServers": servers}


