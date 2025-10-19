from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from ...schemas.support_chat import (
    SupportChatMessageRequest,
    SupportChatMessageResponse,
    SupportChatSessionResponse,
)
from ...services.support_chat import SupportChatManager

router = APIRouter(prefix="/support-chat", tags=["support-chat"])
manager = SupportChatManager()


@router.post("/session", response_model=SupportChatSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_support_session() -> SupportChatSessionResponse:
    session = await manager.create_session()
    history = manager.serialize_history(session)
    return SupportChatSessionResponse(session_id=session.session_id, history=history)


@router.get("/session/{session_id}", response_model=SupportChatSessionResponse)
async def read_support_session(session_id: str) -> SupportChatSessionResponse:
    session = await manager.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    history = manager.serialize_history(session)
    return SupportChatSessionResponse(session_id=session.session_id, history=history)


@router.post(
    "/session/{session_id}/message",
    response_model=SupportChatMessageResponse,
)
async def post_support_message(
    session_id: str,
    payload: SupportChatMessageRequest,
) -> SupportChatMessageResponse:
    session = await manager.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message cannot be empty")

    await manager.append_message(session_id, "user", content)
    reply_text = await manager.generate_reply(session, content)
    reply_message = await manager.append_message(session_id, "assistant", reply_text)
    if reply_message is None:  # pragma: no cover - defensive
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to record reply")

    history = manager.serialize_history(session)
    return SupportChatMessageResponse(
        session_id=session.session_id,
        history=history,
        message=manager.serialize_message(reply_message),
    )


__all__ = [
    "router",
]
