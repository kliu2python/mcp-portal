from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...models import PromptTemplate
from ...schemas import PromptTemplateCreate, PromptTemplateRead, PromptTemplateUpdate
from ...services.converters import prompt_to_read

router = APIRouter()


@router.get("/prompts", response_model=List[PromptTemplateRead])
async def list_prompts(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(PromptTemplate).order_by(PromptTemplate.created_at.desc()))
    prompts = result.scalars().all()
    return [prompt_to_read(prompt) for prompt in prompts]


@router.post("/prompts", response_model=PromptTemplateRead, status_code=status.HTTP_201_CREATED)
async def create_prompt(
    payload: PromptTemplateCreate, session: AsyncSession = Depends(get_db)
):
    prompt = PromptTemplate(
        name=payload.name,
        description=payload.description,
        template=payload.template,
        is_system=False,
    )
    session.add(prompt)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Prompt name already exists.")
    await session.refresh(prompt)
    return prompt_to_read(prompt)


@router.put("/prompts/{prompt_id}", response_model=PromptTemplateRead)
async def update_prompt(
    prompt_id: int, payload: PromptTemplateUpdate, session: AsyncSession = Depends(get_db)
):
    prompt = await session.get(PromptTemplate, prompt_id)
    if prompt is None:
        raise HTTPException(status_code=404, detail="Prompt not found.")
    if prompt.is_system:
        raise HTTPException(status_code=400, detail="System prompts cannot be modified.")

    if payload.name is not None:
        prompt.name = payload.name
    if payload.description is not None:
        prompt.description = payload.description
    if payload.template is not None:
        prompt.template = payload.template

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Prompt name already exists.")

    await session.refresh(prompt)
    return prompt_to_read(prompt)


@router.delete("/prompts/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prompt(prompt_id: int, session: AsyncSession = Depends(get_db)):
    prompt = await session.get(PromptTemplate, prompt_id)
    if prompt is None:
        raise HTTPException(status_code=404, detail="Prompt not found.")
    if prompt.is_system:
        raise HTTPException(status_code=400, detail="System prompts cannot be deleted.")

    await session.delete(prompt)
    await session.commit()
