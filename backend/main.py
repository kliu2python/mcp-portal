from __future__ import annotations

import asyncio
import json
import os
import re
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, AsyncIterator, Dict, Iterable, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field as PydanticField, field_validator
from sqlalchemy import Column, case, func, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.types import JSON
from sqlmodel import Field, Session, SQLModel, create_engine, select
from PIL import Image, ImageDraw

load_dotenv()

APP_TITLE = "Web Automation Quality Portal"
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./automation.db")
REPORT_ROOT = Path(os.getenv("REPORT_ROOT", "reports"))
SCREENSHOT_DIR = REPORT_ROOT / "screenshots"
DEFAULT_EXECUTOR = os.getenv("DEFAULT_EXECUTOR", "automation-bot")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL") or os.getenv("OPENAI_MODEL") or "gpt-4.1-mini"
STEP_DELAY_SECONDS = float(os.getenv("STEP_DELAY_SECONDS", "0.6"))
ALLOWED_PRIORITIES = {"critical", "high", "medium", "low"}
ALLOWED_STATUSES = {"draft", "ready", "in-review", "deprecated", "archived"}
connect_args: Dict[str, Any] = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args, pool_pre_ping=True)


def _now() -> datetime:
    return datetime.utcnow()


def _normalize_priority(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized not in ALLOWED_PRIORITIES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unsupported priority '{value}'.")
    return normalized


def _normalize_status(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized not in ALLOWED_STATUSES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unsupported status '{value}'.")
    return normalized


def _normalize_tags(tags: Optional[Iterable[str]]) -> List[str]:
    if not tags:
        return []
    cleaned = {tag.strip().lower() for tag in tags if tag and tag.strip()}
    return sorted(cleaned)


def _prepare_steps(raw_steps: Optional[Iterable[Any]]) -> List[Dict[str, Any]]:
    if raw_steps is None:
        return []
    normalized: List[Dict[str, Any]] = []
    for index, step in enumerate(raw_steps):
        if isinstance(step, str):
            normalized.append({"action": step.strip(), "expected": "", "target": "", "data": {}})
            continue
        if isinstance(step, dict):
            action = (step.get("action") or step.get("description") or step.get("step") or "").strip()
            expected = (step.get("expected") or step.get("assertion") or step.get("result") or "").strip()
            target = (step.get("target") or step.get("selector") or step.get("element") or "").strip()
            data = step.get("data") or {}
            normalized.append({
                "action": action or f"Step {index + 1}",
                "expected": expected,
                "target": target,
                "data": data,
            })
            continue
        normalized.append({"action": str(step), "expected": "", "target": "", "data": {}})
    return normalized


def _generate_steps_from_prompt(prompt: str) -> List[Dict[str, Any]]:
    fragments = [fragment.strip() for fragment in re.split(r"[\n\.;]", prompt) if fragment.strip()]
    if not fragments:
        return [{"action": prompt.strip(), "expected": "Execute without error", "target": "", "data": {}}]
    return [
        {
            "action": fragment,
            "expected": "Expected outcome described in the scenario",
            "target": "",
            "data": {},
        }
        for fragment in fragments
    ]


def _ensure_report_directories() -> None:
    REPORT_ROOT.mkdir(parents=True, exist_ok=True)
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)


def _ensure_database_schema() -> None:
    SQLModel.metadata.create_all(engine)
    with engine.connect() as connection:
        inspector = inspect(connection)
        columns = {column["name"] for column in inspector.get_columns("testexecution")}
        if "model" not in columns:
            connection.execute(text("ALTER TABLE testexecution ADD COLUMN model VARCHAR"))
            connection.commit()


def _create_placeholder_screenshot(execution_id: int, step_index: int, description: str, status_value: str) -> str:
    _ensure_report_directories()
    execution_dir = SCREENSHOT_DIR / f"execution_{execution_id}"
    execution_dir.mkdir(parents=True, exist_ok=True)
    output_path = execution_dir / f"step_{step_index + 1}.png"

    image = Image.new("RGB", (1280, 720), color=(14, 18, 33))
    draw = ImageDraw.Draw(image)
    header = f"Execution #{execution_id}"
    status_label = status_value.capitalize()
    draw.text((48, 48), header, fill=(94, 234, 212))
    draw.text((48, 120), f"Status: {status_label}", fill=(248, 250, 252))
    draw.text((48, 192), f"Step {step_index + 1}", fill=(94, 234, 212))

    text_lines = []
    words = description.split()
    current_line = ""
    for word in words:
        candidate = f"{current_line} {word}".strip()
        if len(candidate) > 70:
            text_lines.append(current_line)
            current_line = word
        else:
            current_line = candidate
    if current_line:
        text_lines.append(current_line)

    y_offset = 264
    for line in text_lines:
        draw.text((48, y_offset), line, fill=(226, 232, 240))
        y_offset += 48

    image.save(output_path)
    relative_path = output_path.relative_to(REPORT_ROOT)
    return f"/reports/{relative_path.as_posix()}"


class TestCaseBase(SQLModel):
    title: str
    description: str = ""
    steps: List[Dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    tags: List[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    category: Optional[str] = None
    priority: str = Field(default="medium")
    status: str = Field(default="draft")
    owner: Optional[str] = None

    @field_validator("priority")
    @classmethod
    def _validate_priority(cls, value: str) -> str:
        return _normalize_priority(value) or "medium"

    @field_validator("status")
    @classmethod
    def _validate_status(cls, value: str) -> str:
        return _normalize_status(value) or "draft"

    @field_validator("tags", mode="before")
    @classmethod
    def _validate_tags(cls, value: Iterable[str]) -> List[str]:
        return _normalize_tags(value)

    @field_validator("steps", mode="before")
    @classmethod
    def _validate_steps(cls, value: Iterable[Any]) -> List[Dict[str, Any]]:
        return _prepare_steps(value)


class TestCase(TestCaseBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_now, nullable=False)
    updated_at: datetime = Field(default_factory=_now, nullable=False)


class TestCaseCreate(TestCaseBase):
    pass


class TestCaseRead(TestCaseBase):
    id: int
    created_at: datetime
    updated_at: datetime


class TestCaseUpdate(SQLModel):
    title: Optional[str] = None
    description: Optional[str] = None
    steps: Optional[List[Dict[str, Any]]] = None
    tags: Optional[List[str]] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    owner: Optional[str] = None


class TestExecutionBase(SQLModel):
    name: str
    test_case_id: Optional[int] = Field(default=None, foreign_key="testcase.id")
    status: str = Field(default="queued")
    requested_by: str = Field(default=DEFAULT_EXECUTOR)
    prompt: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    tags: List[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    model: str = Field(default=DEFAULT_MODEL)
    total_steps: int = 0
    passed_steps: int = 0
    failed_steps: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    error_message: Optional[str] = None


class TestExecution(TestExecutionBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class StepResult(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    execution_id: int = Field(foreign_key="testexecution.id", nullable=False)
    step_index: int
    action: str
    expected: Optional[str] = None
    status: str = Field(default="pending")
    details: Optional[str] = None
    screenshot_path: Optional[str] = None
    started_at: datetime = Field(default_factory=_now, nullable=False)
    completed_at: Optional[datetime] = None


class ExecutionStartRequest(BaseModel):
    test_case_id: Optional[int] = None
    prompt: Optional[str] = None
    requested_by: Optional[str] = None
    tags: List[str] = PydanticField(default_factory=list)
    priority: Optional[str] = None
    category: Optional[str] = None
    name: Optional[str] = None
    model: Optional[str] = None

    @field_validator("tags", mode="before")
    @classmethod
    def _clean_tags(cls, value: Iterable[str]) -> List[str]:
        return _normalize_tags(value)

    @field_validator("priority")
    @classmethod
    def _clean_priority(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_priority(value)

    @field_validator("category")
    @classmethod
    def _clean_category(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if isinstance(value, str) else value

    @field_validator("model")
    @classmethod
    def _clean_model(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class BatchExecutionRequest(BaseModel):
    test_case_ids: List[int]
    requested_by: Optional[str] = None
    tags: List[str] = PydanticField(default_factory=list)
    model: Optional[str] = None

    @field_validator("tags", mode="before")
    @classmethod
    def _clean_tags(cls, value: Iterable[str]) -> List[str]:
        return _normalize_tags(value)

    @field_validator("model")
    @classmethod
    def _clean_model(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class BulkUpdateRequest(BaseModel):
    ids: List[int]
    status: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[List[str]] = None

    @field_validator("status")
    @classmethod
    def _clean_status(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_status(value)

    @field_validator("priority")
    @classmethod
    def _clean_priority(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_priority(value)

    @field_validator("tags", mode="before")
    @classmethod
    def _clean_tags(cls, value: Optional[Iterable[str]]) -> Optional[List[str]]:
        if value is None:
            return None
        return _normalize_tags(value)


class StepResultRead(BaseModel):
    id: int
    execution_id: int
    step_index: int
    action: str
    expected: Optional[str]
    status: str
    details: Optional[str]
    screenshot_path: Optional[str]
    started_at: datetime
    completed_at: Optional[datetime]


class TestExecutionRead(BaseModel):
    id: int
    name: str
    status: str
    requested_by: str
    prompt: Optional[str]
    test_case_id: Optional[int]
    category: Optional[str]
    priority: Optional[str]
    tags: List[str]
    model: str
    total_steps: int
    passed_steps: int
    failed_steps: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_ms: Optional[int]
    error_message: Optional[str]


class ExecutionDetail(TestExecutionRead):
    steps: List[StepResultRead]
    test_case: Optional[TestCaseRead]


class MetricsSummary(BaseModel):
    total_cases: int
    total_executions: int
    active_executions: int
    pass_rate: float
    average_execution_seconds: float
    by_priority: Dict[str, int]
    by_status: Dict[str, int]


class TrendPoint(BaseModel):
    label: str
    executions: int
    passed: int
    failed: int
    average_duration_seconds: float


class BreakdownPoint(BaseModel):
    label: str
    executions: int
    passed: int
    failed: int


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    _ensure_report_directories()
    _ensure_database_schema()
    yield


app = FastAPI(title=APP_TITLE, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_ensure_report_directories()
app.mount("/reports", StaticFiles(directory=str(REPORT_ROOT), html=False), name="reports")


def get_session() -> Iterable[Session]:
    with Session(engine) as session:
        yield session


class ExecutionManager:
    def __init__(self) -> None:
        self._tasks: Dict[int, asyncio.Task] = {}
        self._subscribers: Dict[int, List[asyncio.Queue]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def enqueue(self, execution_id: int) -> None:
        async with self._lock:
            if execution_id in self._tasks:
                return
            task = asyncio.create_task(self._run_execution(execution_id))
            self._tasks[execution_id] = task
            task.add_done_callback(lambda _: asyncio.create_task(self._cleanup(execution_id)))

    async def subscribe(self, execution_id: int) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            self._subscribers[execution_id].append(queue)
        return queue

    async def _cleanup(self, execution_id: int) -> None:
        async with self._lock:
            self._tasks.pop(execution_id, None)
            self._subscribers.pop(execution_id, None)

    async def unsubscribe(self, execution_id: int, queue: asyncio.Queue) -> None:
        async with self._lock:
            if execution_id in self._subscribers and queue in self._subscribers[execution_id]:
                self._subscribers[execution_id].remove(queue)
                if not self._subscribers[execution_id]:
                    self._subscribers.pop(execution_id, None)

    async def publish(self, execution_id: int, payload: Dict[str, Any]) -> None:
        async with self._lock:
            subscribers = list(self._subscribers.get(execution_id, []))
        for queue in subscribers:
            await queue.put(payload)

    async def _run_execution(self, execution_id: int) -> None:
        try:
            async with self._lock:
                queues_snapshot = list(self._subscribers.get(execution_id, []))
            with Session(engine) as session:
                execution = session.get(TestExecution, execution_id)
                if execution is None:
                    return

                test_case: Optional[TestCase] = session.get(TestCase, execution.test_case_id) if execution.test_case_id else None
                steps = list(test_case.steps if test_case else [])
                if not steps and execution.prompt:
                    steps = _generate_steps_from_prompt(execution.prompt)

                if not steps:
                    execution.status = "failed"
                    execution.error_message = "No steps available for execution."
                    execution.completed_at = _now()
                    execution.duration_ms = 0
                    session.add(execution)
                    session.commit()
                    await self.publish(execution_id, {"type": "completed", "status": execution.status})
                    return

                execution.total_steps = len(steps)
                execution.status = "running"
                execution.started_at = _now()
                execution.completed_at = None
                execution.duration_ms = None
                execution.failed_steps = 0
                execution.passed_steps = 0
                execution.error_message = None
                session.add(execution)
                session.commit()

                await self.publish(
                    execution_id,
                    {
                        "type": "status",
                        "status": execution.status,
                        "total_steps": execution.total_steps,
                        "passed_steps": execution.passed_steps,
                        "failed_steps": execution.failed_steps,
                    },
                )

                for index, step in enumerate(steps):
                    action = step.get("action") if isinstance(step, dict) else str(step)
                    expected = step.get("expected") if isinstance(step, dict) else None
                    details = step.get("notes") if isinstance(step, dict) else None

                    step_result = StepResult(
                        execution_id=execution.id,
                        step_index=index,
                        action=action,
                        expected=expected,
                        status="running",
                        details=details,
                    )
                    session.add(step_result)
                    session.commit()
                    session.refresh(step_result)

                    await self.publish(
                        execution_id,
                        {
                            "type": "step-start",
                            "step_index": index,
                            "step_id": step_result.id,
                            "action": action,
                        },
                    )

                    await asyncio.sleep(STEP_DELAY_SECONDS)

                    try:
                        screenshot_path = _create_placeholder_screenshot(execution.id, index, action, "passed")
                        step_result.status = "passed"
                        step_result.details = step_result.details or "Step executed successfully."
                        step_result.completed_at = _now()
                        step_result.screenshot_path = screenshot_path
                        execution.passed_steps += 1
                        session.add(step_result)
                        session.add(execution)
                        session.commit()

                        await self.publish(
                            execution_id,
                            {
                                "type": "step-complete",
                                "step_index": index,
                                "step_id": step_result.id,
                                "status": step_result.status,
                                "screenshot_path": screenshot_path,
                            },
                        )
                    except Exception as exc:  # pragma: no cover - defensive
                        step_result.status = "failed"
                        step_result.details = f"Screenshot generation failed: {exc}"
                        step_result.completed_at = _now()
                        execution.failed_steps += 1
                        execution.status = "failed"
                        execution.error_message = "One or more steps failed."
                        session.add(step_result)
                        session.add(execution)
                        session.commit()
                        await self.publish(
                            execution_id,
                            {
                                "type": "step-complete",
                                "step_index": index,
                                "step_id": step_result.id,
                                "status": step_result.status,
                                "error": step_result.details,
                            },
                        )
                        break

                if execution.status != "failed":
                    execution.status = "passed"
                    execution.error_message = None
                execution.completed_at = _now()
                if execution.started_at:
                    execution.duration_ms = int((execution.completed_at - execution.started_at).total_seconds() * 1000)
                session.add(execution)
                session.commit()

                await self.publish(
                    execution_id,
                    {
                        "type": "completed",
                        "status": execution.status,
                        "passed_steps": execution.passed_steps,
                        "failed_steps": execution.failed_steps,
                    },
                )
        except Exception as exc:  # pragma: no cover - defensive
            with Session(engine) as session:
                execution = session.get(TestExecution, execution_id)
                if execution:
                    execution.status = "failed"
                    execution.error_message = str(exc)
                    execution.completed_at = _now()
                    if execution.started_at:
                        execution.duration_ms = int((execution.completed_at - execution.started_at).total_seconds() * 1000)
                    session.add(execution)
                    session.commit()
            await self.publish(
                execution_id,
                {
                    "type": "completed",
                    "status": "failed",
                    "error": str(exc),
                },
            )


def _serialize_step(step: StepResult) -> StepResultRead:
    return StepResultRead(
        id=step.id,
        execution_id=step.execution_id,
        step_index=step.step_index,
        action=step.action,
        expected=step.expected,
        status=step.status,
        details=step.details,
        screenshot_path=step.screenshot_path,
        started_at=step.started_at,
        completed_at=step.completed_at,
    )


def _serialize_execution(session: Session, execution: TestExecution, include_steps: bool = False) -> ExecutionDetail | TestExecutionRead:
    base_data = TestExecutionRead(
        id=execution.id,
        name=execution.name,
        status=execution.status,
        requested_by=execution.requested_by,
        prompt=execution.prompt,
        test_case_id=execution.test_case_id,
        category=execution.category,
        priority=execution.priority,
        tags=execution.tags,
        model=execution.model or DEFAULT_MODEL,
        total_steps=execution.total_steps,
        passed_steps=execution.passed_steps,
        failed_steps=execution.failed_steps,
        started_at=execution.started_at,
        completed_at=execution.completed_at,
        duration_ms=execution.duration_ms,
        error_message=execution.error_message,
    )
    if not include_steps:
        return base_data

    steps_query = select(StepResult).where(StepResult.execution_id == execution.id).order_by(StepResult.step_index)
    steps = session.exec(steps_query).all()
    test_case = session.get(TestCase, execution.test_case_id) if execution.test_case_id else None
    return ExecutionDetail(
        **base_data.model_dump(),
        steps=[_serialize_step(step) for step in steps],
        test_case=TestCaseRead.model_validate(test_case) if test_case else None,
    )


execution_manager = ExecutionManager()


@app.get("/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok", "service": APP_TITLE}


@app.get("/test-cases", response_model=List[TestCaseRead])
def list_test_cases(
    *,
    session: Session = Depends(get_session),
    category: Optional[str] = None,
    tag: Optional[str] = None,
    priority: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
) -> List[TestCaseRead]:
    query = select(TestCase)
    if category:
        query = query.where(TestCase.category == category)
    if priority:
        query = query.where(TestCase.priority == _normalize_priority(priority))
    if status_filter:
        query = query.where(TestCase.status == _normalize_status(status_filter))

    results = session.exec(query).all()
    filtered: List[TestCase] = []
    for case in results:
        if tag and tag.lower() not in {t.lower() for t in case.tags}:
            continue
        if search and search.lower() not in f"{case.title} {case.description}".lower():
            continue
        filtered.append(case)
    return [TestCaseRead.model_validate(item) for item in filtered]


@app.post("/test-cases", response_model=TestCaseRead, status_code=status.HTTP_201_CREATED)
def create_test_case(*, session: Session = Depends(get_session), payload: TestCaseCreate) -> TestCaseRead:
    data = payload.model_dump()
    data["priority"] = _normalize_priority(data.get("priority")) or "medium"
    data["status"] = _normalize_status(data.get("status")) or "draft"
    data["tags"] = _normalize_tags(data.get("tags"))
    data["steps"] = _prepare_steps(data.get("steps"))

    test_case = TestCase(**data)
    session.add(test_case)
    try:
        session.commit()
    except IntegrityError as exc:  # pragma: no cover - defensive
        session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    session.refresh(test_case)
    return TestCaseRead.model_validate(test_case)


@app.get("/test-cases/{test_case_id}", response_model=TestCaseRead)
def get_test_case(*, session: Session = Depends(get_session), test_case_id: int) -> TestCaseRead:
    test_case = session.get(TestCase, test_case_id)
    if not test_case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test case not found")
    return TestCaseRead.model_validate(test_case)


@app.put("/test-cases/{test_case_id}", response_model=TestCaseRead)
def update_test_case(*, session: Session = Depends(get_session), test_case_id: int, payload: TestCaseUpdate) -> TestCaseRead:
    test_case = session.get(TestCase, test_case_id)
    if not test_case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test case not found")

    data = payload.model_dump(exclude_unset=True)
    if "priority" in data:
        test_case.priority = _normalize_priority(data["priority"]) or test_case.priority
    if "status" in data:
        test_case.status = _normalize_status(data["status"]) or test_case.status
    if "tags" in data:
        test_case.tags = _normalize_tags(data.get("tags"))
    if "steps" in data:
        test_case.steps = _prepare_steps(data.get("steps"))

    for key in {"title", "description", "category", "owner"}:
        if key in data and data[key] is not None:
            setattr(test_case, key, data[key])

    test_case.updated_at = _now()
    session.add(test_case)
    session.commit()
    session.refresh(test_case)
    return TestCaseRead.model_validate(test_case)


@app.delete("/test-cases/{test_case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test_case(*, session: Session = Depends(get_session), test_case_id: int) -> None:
    test_case = session.get(TestCase, test_case_id)
    if not test_case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test case not found")
    session.delete(test_case)
    session.commit()


@app.post("/test-cases/bulk-update", response_model=List[TestCaseRead])
def bulk_update_test_cases(*, session: Session = Depends(get_session), payload: BulkUpdateRequest) -> List[TestCaseRead]:
    if not payload.ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No test case ids provided")
    query = select(TestCase).where(TestCase.id.in_(payload.ids))
    cases = session.exec(query).all()
    for case in cases:
        if payload.status:
            case.status = payload.status
        if payload.priority:
            case.priority = payload.priority
        if payload.tags is not None:
            case.tags = payload.tags
        case.updated_at = _now()
        session.add(case)
    session.commit()
    return [TestCaseRead.model_validate(case) for case in cases]


@app.post("/executions", response_model=TestExecutionRead, status_code=status.HTTP_202_ACCEPTED)
async def start_execution(*, session: Session = Depends(get_session), payload: ExecutionStartRequest) -> TestExecutionRead:
    if not payload.test_case_id and not payload.prompt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Either test_case_id or prompt is required")

    requested_by = payload.requested_by or DEFAULT_EXECUTOR
    tags = payload.tags or []
    priority = payload.priority or "medium"
    category = payload.category
    model_name = payload.model or DEFAULT_MODEL

    test_case: Optional[TestCase] = None
    if payload.test_case_id:
        test_case = session.get(TestCase, payload.test_case_id)
        if not test_case:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test case not found")
        category = category or test_case.category
        priority = payload.priority or test_case.priority
        tags = _normalize_tags(tags + test_case.tags)

    name = payload.name or (test_case.title if test_case else "Ad-hoc Execution")
    execution = TestExecution(
        name=name,
        test_case_id=test_case.id if test_case else None,
        requested_by=requested_by,
        prompt=payload.prompt,
        status="queued",
        category=category,
        priority=priority,
        tags=tags,
        model=model_name,
    )
    session.add(execution)
    session.commit()
    session.refresh(execution)

    await execution_manager.enqueue(execution.id)
    return _serialize_execution(session, execution)


@app.post("/executions/batch", response_model=List[TestExecutionRead], status_code=status.HTTP_202_ACCEPTED)
async def start_batch_execution(*, session: Session = Depends(get_session), payload: BatchExecutionRequest) -> List[TestExecutionRead]:
    if not payload.test_case_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No test case ids provided")

    executions: List[TestExecutionRead] = []
    model_name = payload.model or DEFAULT_MODEL
    for case_id in payload.test_case_ids:
        test_case = session.get(TestCase, case_id)
        if not test_case:
            continue
        execution = TestExecution(
            name=f"{test_case.title} Run",
            test_case_id=test_case.id,
            requested_by=payload.requested_by or DEFAULT_EXECUTOR,
            prompt=None,
            status="queued",
            category=test_case.category,
            priority=test_case.priority,
            tags=_normalize_tags(payload.tags + test_case.tags),
            model=model_name,
        )
        session.add(execution)
        session.commit()
        session.refresh(execution)
        executions.append(_serialize_execution(session, execution))
        await execution_manager.enqueue(execution.id)
    return executions


@app.get("/executions", response_model=List[TestExecutionRead])
def list_executions(
    *,
    session: Session = Depends(get_session),
    status_filter: Optional[str] = Query(None, alias="status"),
    requested_by: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
) -> List[TestExecutionRead]:
    query = select(TestExecution).order_by(TestExecution.started_at.desc().nullslast(), TestExecution.id.desc()).limit(limit)
    if status_filter:
        query = query.where(TestExecution.status == status_filter.lower())
    if requested_by:
        query = query.where(TestExecution.requested_by == requested_by)
    executions = session.exec(query).all()
    return [_serialize_execution(session, execution) for execution in executions]


@app.get("/executions/active", response_model=List[TestExecutionRead])
def list_active_executions(*, session: Session = Depends(get_session)) -> List[TestExecutionRead]:
    query = select(TestExecution).where(TestExecution.status.in_(["queued", "running"])).order_by(TestExecution.started_at.desc().nullslast())
    executions = session.exec(query).all()
    return [_serialize_execution(session, execution) for execution in executions]


@app.get("/executions/{execution_id}", response_model=ExecutionDetail)
def get_execution(*, session: Session = Depends(get_session), execution_id: int) -> ExecutionDetail:
    execution = session.get(TestExecution, execution_id)
    if not execution:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Execution not found")
    return _serialize_execution(session, execution, include_steps=True)  # type: ignore[arg-type]


@app.get("/executions/{execution_id}/stream")
async def stream_execution(execution_id: int) -> StreamingResponse:
    with Session(engine) as session:
        execution = session.get(TestExecution, execution_id)
        if not execution:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Execution not found")

    queue = await execution_manager.subscribe(execution_id)

    async def event_generator() -> AsyncIterator[str]:
        try:
            with Session(engine) as read_session:
                current_execution = read_session.get(TestExecution, execution_id)
                if current_execution:
                    initial_payload = _serialize_execution(read_session, current_execution, include_steps=True)
                    yield f"data: {initial_payload.model_dump_json()}\n\n"
            while True:
                event = await queue.get()
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") == "completed":
                    with Session(engine) as final_session:
                        completed_execution = final_session.get(TestExecution, execution_id)
                        if completed_execution:
                            final_payload = _serialize_execution(final_session, completed_execution, include_steps=True)
                            yield f"data: {final_payload.model_dump_json()}\n\n"
                    break
        finally:
            await execution_manager.unsubscribe(execution_id, queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/executions/{execution_id}/report", response_model=ExecutionDetail)
def get_execution_report(*, session: Session = Depends(get_session), execution_id: int) -> ExecutionDetail:
    execution = session.get(TestExecution, execution_id)
    if not execution:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Execution not found")
    return _serialize_execution(session, execution, include_steps=True)  # type: ignore[arg-type]


@app.get("/metrics/summary", response_model=MetricsSummary)
def metrics_summary(*, session: Session = Depends(get_session)) -> MetricsSummary:
    total_cases = session.exec(select(func.count(TestCase.id))).one()
    total_executions = session.exec(select(func.count(TestExecution.id))).one()
    active_executions = session.exec(
        select(func.count(TestExecution.id)).where(TestExecution.status.in_(["queued", "running"]))
    ).one()

    passed_count = session.exec(
        select(func.count(TestExecution.id)).where(TestExecution.status == "passed")
    ).one()
    failed_count = session.exec(
        select(func.count(TestExecution.id)).where(TestExecution.status == "failed")
    ).one()
    pass_rate = float(passed_count) / float(max(total_executions, 1))

    average_duration = session.exec(
        select(func.avg(TestExecution.duration_ms)).where(TestExecution.duration_ms.is_not(None))
    ).one() or 0

    priority_counts: Dict[str, int] = {priority: 0 for priority in ALLOWED_PRIORITIES}
    for priority, count in session.exec(select(TestCase.priority, func.count(TestCase.id)).group_by(TestCase.priority)):
        priority_counts[priority] = count

    status_counts: Dict[str, int] = {status: 0 for status in ALLOWED_STATUSES}
    for status_value, count in session.exec(select(TestCase.status, func.count(TestCase.id)).group_by(TestCase.status)):
        status_counts[status_value] = count

    return MetricsSummary(
        total_cases=total_cases,
        total_executions=total_executions,
        active_executions=active_executions,
        pass_rate=round(pass_rate, 3),
        average_execution_seconds=round(float(average_duration) / 1000.0 if average_duration else 0.0, 2),
        by_priority=priority_counts,
        by_status=status_counts,
    )


@app.get("/metrics/trends", response_model=List[TrendPoint])
def metrics_trends(*, session: Session = Depends(get_session), days: int = Query(14, ge=1, le=90)) -> List[TrendPoint]:
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days - 1)

    results = session.exec(
        select(
            func.date(TestExecution.started_at),
            func.count(TestExecution.id),
            func.sum(case((TestExecution.status == "passed", 1), else_=0)),
            func.sum(case((TestExecution.status == "failed", 1), else_=0)),
            func.avg(TestExecution.duration_ms),
        )
        .where(TestExecution.started_at >= start_date)
        .group_by(func.date(TestExecution.started_at))
        .order_by(func.date(TestExecution.started_at))
    ).all()

    mapping: Dict[str, TrendPoint] = {}
    for row in results:
        date_value, total, passed, failed, avg_duration = row
        label = str(date_value)
        mapping[label] = TrendPoint(
            label=label,
            executions=total or 0,
            passed=passed or 0,
            failed=failed or 0,
            average_duration_seconds=round(float(avg_duration or 0) / 1000.0, 2),
        )

    trend: List[TrendPoint] = []
    current = start_date
    while current <= end_date:
        label = str(current)
        trend.append(
            mapping.get(
                label,
                TrendPoint(label=label, executions=0, passed=0, failed=0, average_duration_seconds=0.0),
            )
        )
        current += timedelta(days=1)
    return trend


@app.get("/metrics/breakdown", response_model=List[BreakdownPoint])
def metrics_breakdown(*, session: Session = Depends(get_session), group_by: str = Query("category")) -> List[BreakdownPoint]:
    if group_by not in {"category", "priority"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported breakdown dimension")

    field = TestExecution.category if group_by == "category" else TestExecution.priority
    results = session.exec(
        select(
            field,
            func.count(TestExecution.id),
            func.sum(case((TestExecution.status == "passed", 1), else_=0)),
            func.sum(case((TestExecution.status == "failed", 1), else_=0)),
        ).group_by(field)
    ).all()

    breakdown: List[BreakdownPoint] = []
    for label, total, passed, failed in results:
        breakdown.append(
            BreakdownPoint(
                label=label or "Unspecified",
                executions=total or 0,
                passed=passed or 0,
                failed=failed or 0,
            )
        )
    return breakdown


@app.get("/tags", response_model=List[str])
def list_tags(*, session: Session = Depends(get_session)) -> List[str]:
    tags: set[str] = set()
    for case in session.exec(select(TestCase)).all():
        tags.update(case.tags)
    for execution in session.exec(select(TestExecution)).all():
        tags.update(execution.tags)
    return sorted(tags)
