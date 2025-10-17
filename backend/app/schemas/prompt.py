from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class PromptTemplateBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = None
    template: str = Field(..., min_length=1)


class PromptTemplateCreate(PromptTemplateBase):
    pass


class PromptTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = None
    template: Optional[str] = Field(default=None, min_length=1)


class PromptTemplateRead(PromptTemplateBase):
    id: int
    is_system: bool
    created_at: datetime
    updated_at: datetime
