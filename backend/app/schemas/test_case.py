from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class TestCaseBase(BaseModel):
    reference: str = Field(..., min_length=1, max_length=100)
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    category: Optional[str] = None
    priority: str = Field(default="Medium", max_length=50)
    status: str = Field(default="Draft", max_length=50)
    tags: List[str] = Field(default_factory=list)
    steps: List[str] = Field(default_factory=list)


class TestCaseCreate(TestCaseBase):
    pass


class TestCaseUpdate(BaseModel):
    reference: Optional[str] = Field(default=None, max_length=100)
    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = Field(default=None, max_length=50)
    status: Optional[str] = Field(default=None, max_length=50)
    tags: Optional[List[str]] = None
    steps: Optional[List[str]] = None


class TestCaseRead(TestCaseBase):
    id: int
    created_at: datetime
    updated_at: datetime
