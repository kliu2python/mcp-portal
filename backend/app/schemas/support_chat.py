from __future__ import annotations

from datetime import datetime
from typing import List, Literal

from pydantic import BaseModel, Field


class SupportChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    timestamp: datetime


class SupportChatSessionResponse(BaseModel):
    session_id: str
    history: List[SupportChatMessage] = Field(default_factory=list)


class SupportChatMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class SupportChatMessageResponse(SupportChatSessionResponse):
    message: SupportChatMessage


__all__ = [
    "SupportChatMessage",
    "SupportChatMessageRequest",
    "SupportChatMessageResponse",
    "SupportChatSessionResponse",
]
