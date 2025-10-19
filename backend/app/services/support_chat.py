from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import uuid4

import httpx

logger = logging.getLogger(__name__)


@dataclass
class SupportChatMessageRecord:
    role: str
    content: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class SupportChatSessionRecord:
    session_id: str
    messages: List[SupportChatMessageRecord] = field(default_factory=list)


class SupportChatManager:
    """Manages lightweight in-memory chat sessions for customer support."""

    def __init__(self) -> None:
        self._sessions: Dict[str, SupportChatSessionRecord] = {}
        self._lock = asyncio.Lock()

    async def create_session(self) -> SupportChatSessionRecord:
        session = SupportChatSessionRecord(session_id=uuid4().hex)
        async with self._lock:
            self._sessions[session.session_id] = session
        return session

    async def get_session(self, session_id: str) -> Optional[SupportChatSessionRecord]:
        async with self._lock:
            return self._sessions.get(session_id)

    async def append_message(self, session_id: str, role: str, content: str) -> Optional[SupportChatMessageRecord]:
        message = SupportChatMessageRecord(role=role, content=content)
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            session.messages.append(message)
        return message

    def serialize_history(self, session: SupportChatSessionRecord) -> List[Dict[str, str]]:
        return [self.serialize_message(message) for message in session.messages]

    @staticmethod
    def serialize_message(message: SupportChatMessageRecord) -> Dict[str, str]:
        return {
            "role": message.role,
            "content": message.content,
            "timestamp": message.timestamp.isoformat(),
        }

    async def generate_reply(self, session: SupportChatSessionRecord, user_message: str) -> str:
        """Request a reply from the configured chatbot server or fall back to a default."""

        payload = {
            "session_id": session.session_id,
            "message": user_message,
            "history": self.serialize_history(session),
        }
        bot_url = os.getenv("SUPPORT_CHATBOT_URL")
        if bot_url:
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.post(bot_url, json=payload)
                    response.raise_for_status()
                    data = response.json()
            except httpx.HTTPError:
                logger.warning("Support chatbot request failed", exc_info=True)
            except Exception:  # pragma: no cover - defensive guardrail
                logger.exception("Unexpected error contacting support chatbot")
            else:
                for key in ("reply", "response", "message", "answer"):
                    value = data.get(key)
                    if isinstance(value, str) and value.strip():
                        return value.strip()
                logger.warning("Support chatbot response missing expected fields: %s", data)

        return (
            "I'm here to help you configure FortiIdentity Cloud. Please share the MFA or "
            "identity management goal you're working on so I can provide detailed guidance."
        )


__all__ = ["SupportChatManager"]
