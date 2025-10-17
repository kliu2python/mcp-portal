from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...models import ModelConfig
from ...schemas import ModelConfigCreate, ModelConfigRead, ModelConfigUpdate
from ...services.converters import model_config_to_read
from ...utils.json import dump_dict

router = APIRouter()


@router.get("/model-configs", response_model=List[ModelConfigRead])
async def list_model_configs(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(ModelConfig).order_by(ModelConfig.created_at.desc()))
    configs = result.scalars().all()
    return [model_config_to_read(config) for config in configs]


@router.post("/model-configs", response_model=ModelConfigRead, status_code=status.HTTP_201_CREATED)
async def create_model_config(
    payload: ModelConfigCreate, session: AsyncSession = Depends(get_db)
):
    config = ModelConfig(
        name=payload.name,
        provider=payload.provider,
        description=payload.description,
        parameters=dump_dict(payload.parameters),
    )
    session.add(config)
    await session.commit()
    await session.refresh(config)
    return model_config_to_read(config)


@router.put("/model-configs/{config_id}", response_model=ModelConfigRead)
async def update_model_config(
    config_id: int, payload: ModelConfigUpdate, session: AsyncSession = Depends(get_db)
):
    config = await session.get(ModelConfig, config_id)
    if config is None:
        raise HTTPException(status_code=404, detail="Model configuration not found.")

    if payload.name is not None:
        config.name = payload.name
    if payload.provider is not None:
        config.provider = payload.provider
    if payload.description is not None:
        config.description = payload.description
    if payload.parameters is not None:
        config.parameters = dump_dict(payload.parameters)

    await session.commit()
    await session.refresh(config)
    return model_config_to_read(config)


@router.delete("/model-configs/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model_config(config_id: int, session: AsyncSession = Depends(get_db)):
    config = await session.get(ModelConfig, config_id)
    if config is None:
        raise HTTPException(status_code=404, detail="Model configuration not found.")

    await session.delete(config)
    await session.commit()
