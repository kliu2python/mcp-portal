from __future__ import annotations

import httpx
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from ..models import LLMModel, PromptTemplate


async def verify_openai_model(base_url: str, api_key: str, model_name: str) -> None:
    url = f"{base_url.rstrip('/')}/models/{model_name}"
    headers = {
        "Authorization": f"Bearer {api_key}",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, headers=headers)
    except httpx.HTTPError as exc:  # pragma: no cover - network dependent
        raise HTTPException(status_code=400, detail=f"Unable to reach model endpoint: {exc}") from exc

    if response.status_code == 200:
        return
    if response.status_code == 404:
        raise HTTPException(status_code=400, detail="Model not found at provided endpoint.")
    raise HTTPException(
        status_code=400,
        detail=f"Model verification failed with status {response.status_code}: {response.text[:200]}",
    )


async def get_prompt_template(session: AsyncSession, prompt_id: int) -> PromptTemplate:
    prompt = await session.get(PromptTemplate, prompt_id)
    if prompt is None:
        raise HTTPException(status_code=404, detail="Prompt template not found.")
    return prompt


async def get_llm_model(session: AsyncSession, model_id: int) -> LLMModel:
    model = await session.get(LLMModel, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="LLM model not found.")
    return model
