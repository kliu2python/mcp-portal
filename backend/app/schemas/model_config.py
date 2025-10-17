from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class ModelConfigBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    provider: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    parameters: Dict[str, Any] = Field(default_factory=dict)


class ModelConfigCreate(ModelConfigBase):
    pass


class ModelConfigUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=150)
    provider: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None


class ModelConfigRead(ModelConfigBase):
    id: int
    created_at: datetime
    updated_at: datetime
