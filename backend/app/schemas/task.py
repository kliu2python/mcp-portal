from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class TaskRequest(BaseModel):
    task: str
    model_id: Optional[int] = None
    prompt_id: Optional[int] = None
    prompt_text: Optional[str] = None
    save_to_history: bool = True
    test_case_id: Optional[int] = None
