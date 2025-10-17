from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, HttpUrl


class LLMModelBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    base_url: HttpUrl
    api_key: str = Field(..., min_length=1)
    model_name: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = None


class LLMModelCreate(LLMModelBase):
    pass


class LLMModelUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    base_url: Optional[HttpUrl] = None
    api_key: Optional[str] = Field(default=None, min_length=1)
    model_name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = None


class LLMModelVerify(BaseModel):
    base_url: HttpUrl
    api_key: str = Field(..., min_length=1)
    model_name: str = Field(..., min_length=1, max_length=150)


class LLMModelRead(BaseModel):
    id: int
    name: str
    base_url: HttpUrl
    model_name: str
    description: Optional[str]
    is_system: bool
    masked_api_key: str
    created_at: datetime
    updated_at: datetime
