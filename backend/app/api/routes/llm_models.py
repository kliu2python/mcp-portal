from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...models import LLMModel
from ...schemas import LLMModelCreate, LLMModelRead, LLMModelUpdate, LLMModelVerify
from ...services.converters import llm_model_to_read
from ...services.llm import verify_openai_model

router = APIRouter()


@router.get("/llm-models", response_model=List[LLMModelRead])
async def list_llm_models(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(LLMModel).order_by(LLMModel.created_at.desc()))
    models = result.scalars().all()
    return [llm_model_to_read(model) for model in models]


@router.post("/llm-models/verify")
async def verify_llm_model(payload: LLMModelVerify):
    await verify_openai_model(str(payload.base_url), payload.api_key, payload.model_name)
    return {"status": "ok"}


@router.post("/llm-models", response_model=LLMModelRead, status_code=status.HTTP_201_CREATED)
async def create_llm_model(
    payload: LLMModelCreate, session: AsyncSession = Depends(get_db)
):
    await verify_openai_model(str(payload.base_url), payload.api_key, payload.model_name)

    model = LLMModel(
        name=payload.name,
        base_url=str(payload.base_url),
        api_key=payload.api_key,
        model_name=payload.model_name,
        description=payload.description,
        is_system=False,
    )
    session.add(model)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Model name already exists.")
    await session.refresh(model)
    return llm_model_to_read(model)


@router.put("/llm-models/{model_id}", response_model=LLMModelRead)
async def update_llm_model(
    model_id: int, payload: LLMModelUpdate, session: AsyncSession = Depends(get_db)
):
    model = await session.get(LLMModel, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="LLM model not found.")
    if model.is_system:
        raise HTTPException(status_code=400, detail="System models cannot be modified.")

    new_base_url = str(payload.base_url) if payload.base_url is not None else model.base_url
    new_api_key = payload.api_key if payload.api_key is not None else model.api_key
    new_model_name = payload.model_name if payload.model_name is not None else model.model_name

    if (
        new_base_url != model.base_url
        or new_api_key != model.api_key
        or new_model_name != model.model_name
    ):
        await verify_openai_model(new_base_url, new_api_key, new_model_name)

    if payload.name is not None:
        model.name = payload.name
    if payload.description is not None:
        model.description = payload.description
    model.base_url = new_base_url
    model.api_key = new_api_key
    model.model_name = new_model_name

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Model name already exists.")
    await session.refresh(model)
    return llm_model_to_read(model)


@router.delete("/llm-models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_llm_model(model_id: int, session: AsyncSession = Depends(get_db)):
    model = await session.get(LLMModel, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="LLM model not found.")
    if model.is_system:
        raise HTTPException(status_code=400, detail="System models cannot be deleted.")

    await session.delete(model)
    await session.commit()
