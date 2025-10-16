from __future__ import annotations

import asyncio
import json
import os
import uuid
from contextlib import suppress
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field, HttpUrl

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from langchain_openai import ChatOpenAI
from mcp_use import MCPAgent, MCPClient

import redis.asyncio as redis
from redis.exceptions import RedisError

load_dotenv()

app = FastAPI(title="MCP Portal Backend")


def _get_redis_client() -> "redis.Redis":
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    return redis.from_url(redis_url, encoding="utf-8", decode_responses=True)


redis_client = _get_redis_client()

LOG_DIR = Path(os.getenv("TASK_LOG_DIR", "task_logs"))

_DEFAULT_DB_PATH = Path(
    os.getenv("DATABASE_FILE", Path(__file__).resolve().parent / "data.db")
)
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL is None:
    _DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATABASE_URL = f"sqlite+aiosqlite:///{_DEFAULT_DB_PATH}"

engine = create_async_engine(DATABASE_URL, echo=False, future=True)
AsyncSessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
Base = declarative_base()


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String(100), unique=True, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)
    priority = Column(String(50), nullable=False, default="Medium")
    status = Column(String(50), nullable=False, default="Draft")
    tags = Column(Text, nullable=False, default="[]")
    steps = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class ModelConfig(Base):
    __tablename__ = "model_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    provider = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    parameters = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class TestRun(Base):
    __tablename__ = "test_runs"

    id = Column(Integer, primary_key=True, index=True)
    test_case_id = Column(Integer, ForeignKey("test_cases.id"), nullable=False)
    model_config_id = Column(Integer, ForeignKey("model_configs.id"), nullable=True)
    status = Column(String(50), nullable=False, default="queued")
    result = Column(String(50), nullable=True)
    prompt = Column(Text, nullable=False)
    server_url = Column(String(255), nullable=True)
    xpra_url = Column(String(255), nullable=True)
    task_id = Column(String(64), nullable=True)
    log = Column(Text, nullable=False, default="[]")
    metrics = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)


run_queue: asyncio.Queue[int] = asyncio.Queue()
_run_workers: list[asyncio.Task[Any]] = []


class ManagedTask:
    """Represents an asynchronously executing MCP task."""

    def __init__(self, prompt: str, server_url: str | None) -> None:
        self.prompt = prompt
        self.queue: asyncio.Queue[str | None] = asyncio.Queue()
        self.task: asyncio.Task | None = None
        self.done = asyncio.Event()
        self.status: str = "pending"
        self.server_url = server_url


_tasks: Dict[str, ManagedTask] = {}
_tasks_lock = asyncio.Lock()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _on_startup() -> None:
    await _initialise_database()
    await _resume_queued_runs()
    worker_count = int(os.getenv("TEST_RUN_WORKERS", "2"))
    for index in range(worker_count):
        task = asyncio.create_task(_run_worker(index))
        _run_workers.append(task)


@app.on_event("shutdown")
async def _on_shutdown() -> None:
    for task in _run_workers:
        task.cancel()
    for task in _run_workers:
        with suppress(asyncio.CancelledError):
            await task


class TaskRequest(BaseModel):
    task: str
    server_url: HttpUrl | None = None


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
    model_config_payload: Optional[ModelConfigCreate] = Field(
        default=None, alias="model_config"
    )
    server_url: Optional[HttpUrl] = None
    xpra_url: Optional[HttpUrl] = None
    prompt: Optional[str] = None


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


def _load_string_list(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return [item for item in data if isinstance(item, str)]
    except json.JSONDecodeError:
        return []


def _dump_list(items: Optional[List[str]]) -> str:
    return json.dumps(items or [])


def _load_json_list(raw: Optional[str]) -> List[Dict[str, Any]]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [entry for entry in data if isinstance(entry, dict)]
    except json.JSONDecodeError:
        pass
    return []


def _load_dict(raw: Optional[str]) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    return {}


def _dump_dict(value: Optional[Dict[str, Any]]) -> str:
    return json.dumps(value or {})


def _test_case_to_read(test_case: TestCase) -> TestCaseRead:
    return TestCaseRead(
        id=test_case.id,
        reference=test_case.reference,
        title=test_case.title,
        description=test_case.description,
        category=test_case.category,
        priority=test_case.priority,
        status=test_case.status,
        tags=_load_string_list(test_case.tags),
        steps=_load_string_list(test_case.steps),
        created_at=test_case.created_at,
        updated_at=test_case.updated_at,
    )


def _model_config_to_read(config: ModelConfig) -> ModelConfigRead:
    return ModelConfigRead(
        id=config.id,
        name=config.name,
        provider=config.provider,
        description=config.description,
        parameters=_load_dict(config.parameters),
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


def _test_run_to_read(run: TestRun) -> TestRunRead:
    logs_raw = _load_json_list(run.log)
    log_entries: List[TestRunLogEntry] = []
    for entry in logs_raw:
        if isinstance(entry, dict):
            timestamp = entry.get("timestamp")
            try:
                parsed_timestamp = datetime.fromisoformat(timestamp) if timestamp else datetime.utcnow()
            except ValueError:
                parsed_timestamp = datetime.utcnow()
            log_entries.append(
                TestRunLogEntry(
                    timestamp=parsed_timestamp,
                    type=str(entry.get("type", "info")),
                    message=str(entry.get("message", "")),
                )
            )
    metrics = _load_dict(run.metrics)
    return TestRunRead(
        id=run.id,
        test_case_id=run.test_case_id,
        model_config_id=run.model_config_id,
        status=run.status,
        result=run.result,
        prompt=run.prompt,
        server_url=run.server_url,
        xpra_url=run.xpra_url,
        task_id=run.task_id,
        log=log_entries,
        metrics=metrics,
        created_at=run.created_at,
        updated_at=run.updated_at,
        started_at=run.started_at,
        completed_at=run.completed_at,
    )


async def get_db() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session


async def _append_run_log_entry(
    session: AsyncSession, run: TestRun, message: str, level: str = "info"
) -> None:
    log_entries = _load_json_list(run.log)
    log_entries.append(
        {
            "timestamp": datetime.utcnow().isoformat(),
            "type": level,
            "message": message,
        }
    )
    run.log = json.dumps(log_entries[-200:])
    run.updated_at = datetime.utcnow()
    await session.commit()


async def _initialise_database() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def _resume_queued_runs() -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestRun).where(TestRun.status.in_(["queued", "running"]))
        )
        runs = result.scalars().all()
        for run in runs:
            if run.status == "running":
                run.status = "queued"
                run.started_at = None
                run.task_id = None
                run.updated_at = datetime.utcnow()
        await session.commit()

        for run in runs:
            await run_queue.put(run.id)


async def _process_test_run(run_id: int) -> None:
    async with AsyncSessionLocal() as session:
        run = await session.get(TestRun, run_id)
        if run is None:
            return

        if run.status != "queued":
            return

        test_case = await session.get(TestCase, run.test_case_id)
        if test_case is None:
            run.status = "failed"
            run.result = "missing-test-case"
            run.completed_at = datetime.utcnow()
            run.updated_at = datetime.utcnow()
            await _append_run_log_entry(session, run, "Test case not found", "error")
            return

        run.status = "running"
        run.started_at = datetime.utcnow()
        run.updated_at = datetime.utcnow()
        await session.commit()

        await _append_run_log_entry(
            session,
            run,
            f"Started run for {test_case.reference}: {test_case.title}",
            "info",
        )

        try:
            async for payload in run_agent(run.prompt, run.server_url):
                try:
                    data = json.loads(payload)
                    message_type = str(data.get("type", "info"))
                    message_text = str(data.get("message", ""))
                except json.JSONDecodeError:
                    message_type = "info"
                    message_text = payload

                await _append_run_log_entry(session, run, message_text, message_type)
        except Exception as exc:  # pragma: no cover - defensive
            await _append_run_log_entry(
                session,
                run,
                f"Run failed: {exc}",
                "error",
            )
            run.status = "failed"
            run.result = "error"
            run.completed_at = datetime.utcnow()
            run.updated_at = datetime.utcnow()
            await session.commit()
            return

        run.status = "completed"
        run.result = "success"
        run.completed_at = datetime.utcnow()
        run.updated_at = datetime.utcnow()
        if run.started_at and run.completed_at:
            duration = (run.completed_at - run.started_at).total_seconds()
            metrics = _load_dict(run.metrics)
            metrics["duration"] = duration
            run.metrics = _dump_dict(metrics)
        await session.commit()

        await _append_run_log_entry(
            session,
            run,
            "Run completed successfully.",
            "success",
        )


async def _run_worker(worker_index: int) -> None:
    while True:
        run_id = await run_queue.get()
        try:
            await _process_test_run(run_id)
        except Exception as exc:  # pragma: no cover - defensive
            async with AsyncSessionLocal() as session:
                run = await session.get(TestRun, run_id)
                if run is not None:
                    run.status = "failed"
                    run.result = "error"
                    run.updated_at = datetime.utcnow()
                    await _append_run_log_entry(
                        session,
                        run,
                        f"Worker {worker_index} encountered an error: {exc}",
                        "error",
                    )
        finally:
            run_queue.task_done()


@app.get("/test-cases", response_model=List[TestCaseRead])
async def list_test_cases(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(TestCase).order_by(TestCase.created_at.desc()))
    cases = result.scalars().all()
    return [_test_case_to_read(case) for case in cases]


@app.post("/test-cases", response_model=TestCaseRead, status_code=201)
async def create_test_case(
    payload: TestCaseCreate, session: AsyncSession = Depends(get_db)
):
    test_case = TestCase(
        reference=payload.reference,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        priority=payload.priority,
        status=payload.status,
        tags=_dump_list(payload.tags),
        steps=_dump_list(payload.steps),
    )
    session.add(test_case)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=400, detail="Test case reference must be unique.") from exc

    await session.refresh(test_case)
    return _test_case_to_read(test_case)


@app.put("/test-cases/{test_case_id}", response_model=TestCaseRead)
async def update_test_case(
    test_case_id: int, payload: TestCaseUpdate, session: AsyncSession = Depends(get_db)
):
    test_case = await session.get(TestCase, test_case_id)
    if test_case is None:
        raise HTTPException(status_code=404, detail="Test case not found.")

    if payload.reference is not None:
        test_case.reference = payload.reference
    if payload.title is not None:
        test_case.title = payload.title
    if payload.description is not None:
        test_case.description = payload.description
    if payload.category is not None:
        test_case.category = payload.category
    if payload.priority is not None:
        test_case.priority = payload.priority
    if payload.status is not None:
        test_case.status = payload.status
    if payload.tags is not None:
        test_case.tags = _dump_list(payload.tags)
    if payload.steps is not None:
        test_case.steps = _dump_list(payload.steps)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=400, detail="Test case reference must be unique.") from exc

    await session.refresh(test_case)
    return _test_case_to_read(test_case)


@app.delete("/test-cases/{test_case_id}", status_code=204)
async def delete_test_case(test_case_id: int, session: AsyncSession = Depends(get_db)):
    test_case = await session.get(TestCase, test_case_id)
    if test_case is None:
        raise HTTPException(status_code=404, detail="Test case not found.")

    await session.delete(test_case)
    await session.commit()


@app.get("/model-configs", response_model=List[ModelConfigRead])
async def list_model_configs(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(ModelConfig).order_by(ModelConfig.created_at.desc()))
    configs = result.scalars().all()
    return [_model_config_to_read(config) for config in configs]


@app.post("/model-configs", response_model=ModelConfigRead, status_code=201)
async def create_model_config(
    payload: ModelConfigCreate, session: AsyncSession = Depends(get_db)
):
    config = ModelConfig(
        name=payload.name,
        provider=payload.provider,
        description=payload.description,
        parameters=_dump_dict(payload.parameters),
    )
    session.add(config)
    await session.commit()
    await session.refresh(config)
    return _model_config_to_read(config)


@app.put("/model-configs/{config_id}", response_model=ModelConfigRead)
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
        config.parameters = _dump_dict(payload.parameters)

    await session.commit()
    await session.refresh(config)
    return _model_config_to_read(config)


@app.delete("/model-configs/{config_id}", status_code=204)
async def delete_model_config(config_id: int, session: AsyncSession = Depends(get_db)):
    config = await session.get(ModelConfig, config_id)
    if config is None:
        raise HTTPException(status_code=404, detail="Model configuration not found.")

    await session.delete(config)
    await session.commit()


def _build_prompt_for_case(test_case: TestCase, override_prompt: Optional[str]) -> str:
    if override_prompt:
        return override_prompt

    steps = _load_string_list(test_case.steps)
    steps_section = "\n".join(f"- {step}" for step in steps) if steps else "- Follow documented test scenario steps."
    description = test_case.description or "No description provided."
    category = test_case.category or "Uncategorized"
    return (
        f"Execute automated test case {test_case.reference}: {test_case.title}.\n"
        f"Description: {description}\n"
        f"Category: {category} | Priority: {test_case.priority}\n"
        f"Steps:\n{steps_section}\n"
        "Report detailed step results and ensure assertions complete successfully."
    )


@app.post("/test-runs", response_model=List[TestRunRead], status_code=201)
async def queue_test_runs(
    payload: TestRunRequest, session: AsyncSession = Depends(get_db)
):
    if (
        payload.model_config_id is None
        and payload.model_config_payload is None
    ):
        raise HTTPException(
            status_code=400, detail="Provide model_config_id or model_config payload."
        )

    model_config_id = payload.model_config_id
    created_config: Optional[ModelConfig] = None
    if payload.model_config_payload is not None:
        created_config = ModelConfig(
            name=payload.model_config_payload.name,
            provider=payload.model_config_payload.provider,
            description=payload.model_config_payload.description,
            parameters=_dump_dict(payload.model_config_payload.parameters),
        )
        session.add(created_config)
        await session.commit()
        await session.refresh(created_config)
        model_config_id = created_config.id

    if model_config_id is None:
        raise HTTPException(status_code=400, detail="Unable to resolve model configuration.")

    result = await session.execute(
        select(TestCase).where(TestCase.id.in_(payload.test_case_ids))
    )
    test_cases = {case.id: case for case in result.scalars().all()}
    missing = [case_id for case_id in payload.test_case_ids if case_id not in test_cases]
    if missing:
        raise HTTPException(
            status_code=404, detail=f"Test case(s) not found: {', '.join(map(str, missing))}"
        )

    created_runs: List[TestRun] = []
    for case_id in payload.test_case_ids:
        test_case = test_cases[case_id]
        prompt = _build_prompt_for_case(test_case, payload.prompt)
        run = TestRun(
            test_case_id=test_case.id,
            model_config_id=model_config_id,
            status="queued",
            prompt=prompt,
            server_url=str(payload.server_url) if payload.server_url else None,
            xpra_url=str(payload.xpra_url) if payload.xpra_url else None,
        )
        session.add(run)
        created_runs.append(run)

    await session.commit()

    for run in created_runs:
        await session.refresh(run)
        await _append_run_log_entry(session, run, "Queued for execution", "info")
        await run_queue.put(run.id)

    return [_test_run_to_read(run) for run in created_runs]


@app.get("/test-runs", response_model=List[TestRunRead])
async def list_test_runs(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(TestRun).order_by(TestRun.created_at.desc()))
    runs = result.scalars().all()
    return [_test_run_to_read(run) for run in runs]


@app.get("/test-runs/{run_id}", response_model=TestRunRead)
async def get_test_run(run_id: int, session: AsyncSession = Depends(get_db)):
    run = await session.get(TestRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Test run not found.")
    return _test_run_to_read(run)


@app.get("/quality-insights", response_model=QualityInsightsResponse)
async def get_quality_insights(session: AsyncSession = Depends(get_db)):
    cases_result = await session.execute(select(TestCase))
    cases = cases_result.scalars().all()
    runs_result = await session.execute(select(TestRun))
    runs = runs_result.scalars().all()

    ready_count = sum(1 for case in cases if case.status == "Ready")
    blocked_count = sum(1 for case in cases if case.status == "Blocked")
    draft_count = sum(1 for case in cases if case.status == "Draft")

    total_runs = len(runs)
    pass_count = sum(1 for run in runs if run.result == "success")
    fail_count = sum(1 for run in runs if run.status == "failed")
    success_rate = (pass_count / total_runs * 100) if total_runs else 0.0

    durations = []
    latest_run_at: Optional[datetime] = None
    for run in runs:
        metrics = _load_dict(run.metrics)
        duration = metrics.get("duration")
        if isinstance(duration, (int, float)):
            durations.append(float(duration))
        completed_at = run.completed_at or run.updated_at or run.created_at
        if completed_at and (
            latest_run_at is None or completed_at > latest_run_at
        ):
            latest_run_at = completed_at

    average_duration = sum(durations) / len(durations) if durations else 0.0

    cases_by_id = {case.id: case for case in cases}
    category_stats: Dict[str, Dict[str, float]] = {}
    priority_stats: Dict[str, Dict[str, float]] = {}

    for case in cases:
        category_key = case.category or "Uncategorized"
        priority_key = case.priority or "Unspecified"
        category_stats.setdefault(category_key, {"total": 0, "runs": 0, "pass": 0})
        priority_stats.setdefault(priority_key, {"total": 0, "runs": 0, "pass": 0})
        category_stats[category_key]["total"] += 1
        priority_stats[priority_key]["total"] += 1

    for run in runs:
        case = cases_by_id.get(run.test_case_id)
        if case is None:
            continue
        category_key = case.category or "Uncategorized"
        priority_key = case.priority or "Unspecified"
        category_entry = category_stats.setdefault(category_key, {"total": 0, "runs": 0, "pass": 0})
        priority_entry = priority_stats.setdefault(priority_key, {"total": 0, "runs": 0, "pass": 0})
        category_entry["runs"] += 1
        priority_entry["runs"] += 1
        if run.result == "success":
            category_entry["pass"] += 1
            priority_entry["pass"] += 1

    category_breakdown = [
        QualityCategoryInsight(
            key=key,
            total=int(stats["total"]),
            pass_rate=(stats["pass"] / stats["runs"] * 100) if stats["runs"] else 0.0,
        )
        for key, stats in category_stats.items()
    ]

    priority_breakdown = [
        QualityCategoryInsight(
            key=key,
            total=int(stats["total"]),
            pass_rate=(stats["pass"] / stats["runs"] * 100) if stats["runs"] else 0.0,
        )
        for key, stats in priority_stats.items()
    ]

    return QualityInsightsResponse(
        total_test_cases=len(cases),
        ready_test_cases=ready_count,
        blocked_test_cases=blocked_count,
        draft_test_cases=draft_count,
        total_runs=total_runs,
        pass_count=pass_count,
        fail_count=fail_count,
        success_rate=success_rate,
        average_duration=average_duration,
        latest_run_at=latest_run_at,
        category_breakdown=category_breakdown,
        priority_breakdown=priority_breakdown,
    )


async def _safe_redis_call(coro):
    try:
        return await coro
    except RedisError as exc:  # pragma: no cover - defensive
        raise RuntimeError(f"Redis operation failed: {exc}") from exc


async def _register_task(task_id: str, prompt: str) -> None:
    timestamp = datetime.utcnow().isoformat()
    await _safe_redis_call(
        redis_client.hset(
            f"task:{task_id}",
            mapping={
                "prompt": prompt,
                "status": "running",
                "created_at": timestamp,
                "updated_at": timestamp,
            },
        )
    )
    await _safe_redis_call(redis_client.sadd("tasks:all", task_id))
    await _safe_redis_call(redis_client.sadd("tasks:active", task_id))


async def _append_task_log(task_id: str, payload: str) -> None:
    entry = json.dumps({"timestamp": datetime.utcnow().isoformat(), "payload": payload})
    await _safe_redis_call(redis_client.rpush(f"task:{task_id}:log", entry))
    await _safe_redis_call(
        redis_client.hset(
            f"task:{task_id}",
            mapping={"updated_at": datetime.utcnow().isoformat()},
        )
    )


async def _finalize_task(task_id: str, status: str) -> None:
    timestamp = datetime.utcnow().isoformat()
    await _safe_redis_call(redis_client.srem("tasks:active", task_id))
    await _safe_redis_call(redis_client.srem("tasks:completed", task_id))
    await _safe_redis_call(redis_client.srem("tasks:failed", task_id))
    await _safe_redis_call(redis_client.srem("tasks:cancelled", task_id))
    await _safe_redis_call(redis_client.sadd(f"tasks:{status}", task_id))
    await _safe_redis_call(
        redis_client.hset(
            f"task:{task_id}",
            mapping={"status": status, "completed_at": timestamp, "updated_at": timestamp},
        )
    )


async def _get_task_metadata(task_id: str) -> Dict[str, str]:
    data = await _safe_redis_call(redis_client.hgetall(f"task:{task_id}"))
    if not data:
        raise HTTPException(status_code=404, detail="Task not found.")
    data["task_id"] = task_id
    return data


async def _ensure_log_directory() -> None:
    await asyncio.to_thread(LOG_DIR.mkdir, parents=True, exist_ok=True)


async def _persist_log_file(task_id: str) -> Path:
    await _ensure_log_directory()
    entries: List[str] = await _safe_redis_call(redis_client.lrange(f"task:{task_id}:log", 0, -1))
    if not entries:
        raise HTTPException(status_code=404, detail="No log entries for this task.")

    log_path = LOG_DIR / f"{task_id}.txt"

    def _write_file() -> None:
        with log_path.open("w", encoding="utf-8") as file:
            for entry in entries:
                try:
                    payload = json.loads(entry)
                except json.JSONDecodeError:
                    file.write(f"{entry}\n")
                    continue

                timestamp = payload.get("timestamp", "")
                message = payload.get("payload", "")
                file.write(f"[{timestamp}] {message}\n")

    await asyncio.to_thread(_write_file)

    await _safe_redis_call(
        redis_client.hset(
            f"task:{task_id}",
            mapping={"log_file": str(log_path)},
        )
    )

    return log_path


async def _get_or_create_log_file(task_id: str) -> Path:
    metadata = await _get_task_metadata(task_id)
    existing = metadata.get("log_file")
    if existing:
        path = Path(existing)
        if path.exists():
            return path
    return await _persist_log_file(task_id)


async def _fetch_task_list(set_name: str) -> List[Dict[str, str]]:
    task_ids = await _safe_redis_call(redis_client.smembers(set_name))
    results: List[Dict[str, str]] = []
    for task_id in task_ids:
        try:
            results.append(await _get_task_metadata(task_id))
        except HTTPException:
            continue
    results.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return results


async def _get_task_log_entries(task_id: str) -> List[Dict[str, object]]:
    entries = await _safe_redis_call(redis_client.lrange(f"task:{task_id}:log", 0, -1))
    parsed: List[Dict[str, object]] = []
    for entry in entries:
        try:
            payload = json.loads(entry)
        except json.JSONDecodeError:
            parsed.append({"timestamp": None, "payload": entry})
            continue

        timestamp = payload.get("timestamp")
        raw_message = payload.get("payload")
        try:
            decoded = json.loads(raw_message) if isinstance(raw_message, str) else raw_message
        except json.JSONDecodeError:
            decoded = raw_message

        parsed.append({"timestamp": timestamp, "payload": decoded})

    return parsed


async def run_agent(task: str, server_url: str | None) -> AsyncIterator[str]:
    load_dotenv()

    resolved_server_url = server_url or os.getenv(
        "MCP_SERVER_URL", "http://10.160.13.110:8882/sse"
    )

    config = {
        "mcpServers": {
            "http": {
                "url": resolved_server_url,
            }
        }
    }

    client = MCPClient.from_dict(config)

    llm = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL"),
        base_url=os.getenv("OPENAI_BASE_URL"),
        api_key=os.getenv("OPENAI_API_KEY"),
    )

    agent = MCPAgent(llm=llm, client=client, max_steps=30)

    yield json.dumps({"type": "info", "message": "Starting task execution."})

    try:
        result = await agent.run(task, max_steps=30)
    except Exception as exc:  # pragma: no cover - defensive
        yield json.dumps({"type": "error", "message": str(exc)})
        raise

    yield json.dumps({"type": "success", "message": "Task completed."})
    yield json.dumps({"type": "result", "message": result})


async def _agent_worker(task_id: str, managed_task: ManagedTask) -> None:
    """Background worker that executes the MCP agent and streams output."""

    managed_task.status = "completed"
    try:
        async for message in run_agent(managed_task.prompt, managed_task.server_url):
            await _append_task_log(task_id, message)
            await managed_task.queue.put(message)
    except asyncio.CancelledError:
        managed_task.status = "cancelled"
        await managed_task.queue.put(
            json.dumps({"type": "cancelled", "message": "Task cancelled."})
        )
        await _append_task_log(
            task_id, json.dumps({"type": "cancelled", "message": "Task cancelled."})
        )
        raise
    except Exception as exc:  # pragma: no cover - defensive
        managed_task.status = "failed"
        await managed_task.queue.put(
            json.dumps({"type": "error", "message": str(exc)})
        )
        await _append_task_log(task_id, json.dumps({"type": "error", "message": str(exc)}))
    finally:
        await managed_task.queue.put(None)
        managed_task.done.set()
        try:
            await _finalize_task(task_id, managed_task.status)
        except Exception as exc:  # pragma: no cover - defensive
            await managed_task.queue.put(
                json.dumps({"type": "error", "message": f"Failed to finalize task: {exc}"})
            )
        else:
            if managed_task.status in {"completed", "failed", "cancelled"}:
                with suppress(Exception):  # pragma: no cover - defensive
                    await _persist_log_file(task_id)
        async with _tasks_lock:
            _tasks.pop(task_id, None)


@app.post("/run-task")
async def run_task(request: TaskRequest):
    if not request.task.strip():
        raise HTTPException(status_code=400, detail="Task cannot be empty.")

    task_id = uuid.uuid4().hex
    server_url = str(request.server_url) if request.server_url else None
    if not server_url:
        raise HTTPException(status_code=400, detail="MCP server URL is required.")

    managed_task = ManagedTask(prompt=request.task, server_url=server_url)
    managed_task.status = "running"

    async with _tasks_lock:
        _tasks[task_id] = managed_task

    try:
        await _register_task(task_id, request.task)
    except RuntimeError as exc:
        async with _tasks_lock:
            _tasks.pop(task_id, None)
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    managed_task.task = asyncio.create_task(_agent_worker(task_id, managed_task))

    async def event_stream() -> AsyncIterator[bytes]:
        initial_payload = json.dumps({"type": "task", "taskId": task_id})
        with suppress(Exception):  # pragma: no cover - defensive
            await _append_task_log(task_id, initial_payload)
        yield f"data: {initial_payload}\n\n".encode("utf-8")

        try:
            while True:
                message = await managed_task.queue.get()
                if message is None:
                    break
                yield f"data: {message}\n\n".encode("utf-8")
        finally:
            yield b"data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    async with _tasks_lock:
        managed_task = _tasks.get(task_id)

    if managed_task is None or managed_task.task is None:
        raise HTTPException(status_code=404, detail="Task not found or already completed.")

    if managed_task.task.done():
        return {"status": "completed"}

    managed_task.task.cancel()

    with suppress(asyncio.CancelledError):
        await managed_task.task

    await managed_task.done.wait()

    return {"status": "cancelled"}


@app.get("/tasks")
async def list_tasks():
    try:
        active = await _fetch_task_list("tasks:active")
        completed = await _fetch_task_list("tasks:completed")
        cancelled = await _fetch_task_list("tasks:cancelled")
        failed = await _fetch_task_list("tasks:failed")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "active": active,
        "completed": completed,
        "cancelled": cancelled,
        "failed": failed,
    }


@app.get("/tasks/{task_id}")
async def get_task(task_id: str):
    try:
        metadata = await _get_task_metadata(task_id)
        log_length = await _safe_redis_call(redis_client.llen(f"task:{task_id}:log"))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    metadata["log_length"] = log_length
    return metadata


@app.get("/tasks/{task_id}/log")
async def get_task_log(task_id: str):
    # Ensure the task exists first
    try:
        await _get_task_metadata(task_id)
        entries = await _get_task_log_entries(task_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {"task_id": task_id, "entries": entries}


@app.post("/tasks/{task_id}/log/persist")
async def persist_task_log(task_id: str):
    try:
        path = await _persist_log_file(task_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {"task_id": task_id, "log_file": str(path)}


@app.get("/tasks/{task_id}/log/download")
async def download_task_log(task_id: str):
    try:
        log_path = await _get_or_create_log_file(task_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if not log_path.exists():  # pragma: no cover - defensive
        raise HTTPException(status_code=404, detail="Log file not found.")

    filename = f"task-{task_id}.txt"
    return FileResponse(log_path, media_type="text/plain", filename=filename)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
