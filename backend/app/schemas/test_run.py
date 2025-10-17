from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .model_config import ModelConfigCreate


class TestRunLogEntry(BaseModel):
    timestamp: datetime
    type: str
    message: str


class TestRunRead(BaseModel):
    id: int
    test_case_id: int
    model_config_id: Optional[int]
    status: str
    result: Optional[str]
    prompt: str
    server_url: Optional[str]
    xpra_url: Optional[str]
    task_id: Optional[str]
    log: List[TestRunLogEntry]
    metrics: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]


class TestRunRequest(BaseModel):
    test_case_ids: List[int] = Field(..., min_items=1)
    model_config_id: Optional[int] = None
    model_config_payload: Optional[ModelConfigCreate] = Field(default=None, alias="model_config")
    prompt: Optional[str] = None
    prompt_id: Optional[int] = None


class QualityCategoryInsight(BaseModel):
    key: str
    total: int
    pass_rate: float


class QualityInsightsResponse(BaseModel):
    total_test_cases: int
    ready_test_cases: int
    blocked_test_cases: int
    draft_test_cases: int
    total_runs: int
    pass_count: int
    fail_count: int
    success_rate: float
    average_duration: float
    latest_run_at: Optional[datetime]
    category_breakdown: List[QualityCategoryInsight]
    priority_breakdown: List[QualityCategoryInsight]
