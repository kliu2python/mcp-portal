from __future__ import annotations

import asyncio
import json
import os
import uuid
from collections import deque
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field, HttpUrl

import httpx

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage
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


class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    template = Column(Text, nullable=False)
    is_system = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class LLMModel(Base):
    __tablename__ = "llm_models"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, nullable=False)
    base_url = Column(String(255), nullable=False)
    api_key = Column(String(255), nullable=False)
    model_name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    is_system = Column(Boolean, default=False, nullable=False)
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


@dataclass(frozen=True)
class SessionDefinition:
    identifier: str
    server_url: str
    xpra_url: str


class SessionPool:
    def __init__(self, sessions: List[SessionDefinition]):
        self._available: list[SessionDefinition] = list(sessions)
        self._in_use: Dict[str, SessionDefinition] = {}
        self._waiters: deque[asyncio.Future[SessionDefinition]] = deque()
        self._lock = asyncio.Lock()

    async def acquire_nowait(self) -> SessionDefinition | None:
        async with self._lock:
            if self._available:
                allocation = self._available.pop()
                self._in_use[allocation.identifier] = allocation
                return allocation
            return None

    async def acquire(self) -> SessionDefinition:
        async with self._lock:
            if self._available:
                allocation = self._available.pop()
                self._in_use[allocation.identifier] = allocation
                return allocation
            loop = asyncio.get_running_loop()
            future: asyncio.Future[SessionDefinition] = loop.create_future()
            self._waiters.append(future)

        allocation = await future
        return allocation

    async def release(self, allocation: SessionDefinition) -> None:
        async with self._lock:
            if self._in_use.pop(allocation.identifier, None) is None:
                return
            while self._waiters:
                waiter = self._waiters.popleft()
                if waiter.done():
                    continue
                waiter.set_result(allocation)
                return
            self._available.append(allocation)


SESSION_POOL = SessionPool(
    [
        SessionDefinition("8882", "http://10.160.13.110:8882/sse", "http://10.160.13.110:10000"),
        SessionDefinition("8883", "http://10.160.13.110:8883/sse", "http://10.160.13.110:10001"),
        SessionDefinition("8884", "http://10.160.13.110:8884/sse", "http://10.160.13.110:10002"),
        SessionDefinition("8885", "http://10.160.13.110:8885/sse", "http://10.160.13.110:10003"),
    ]
)

DEFAULT_PROMPT_TEMPLATE = (
    "You are an expert QA automation agent. Carefully execute the requested task and "
    "return clear, concise results. Task instructions:\n{task}"
)


class ManagedTask:
    """Represents an asynchronously executing MCP task."""

    def __init__(self, task_text: str, prompt_template: str | None, llm_settings: Dict[str, str] | None) -> None:
        self.task_text = task_text
        self.prompt_template = prompt_template
        self.llm_settings = llm_settings
        self.queue: asyncio.Queue[str | None] = asyncio.Queue()
        self.task: asyncio.Task | None = None
        self.waiter: asyncio.Task | None = None
        self.done = asyncio.Event()
        self.status: str = "pending"
        self.server_url: str | None = None
        self.xpra_url: str | None = None
        self.session: SessionDefinition | None = None
        self.rendered_prompt: str | None = None
        self.cancel_requested = False
        self.run_id: int | None = None
        self.test_case_id: int | None = None
        self.test_case_reference: str | None = None


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
    await _ensure_default_records()
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
    model_id: Optional[int] = None
    prompt_id: Optional[int] = None
    prompt_text: Optional[str] = None
    save_to_history: bool = True
    test_case_id: Optional[int] = None


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


def _mask_api_key(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}{'*' * (len(value) - 8)}{value[-4:]}"


def _prompt_to_read(template: PromptTemplate) -> PromptTemplateRead:
    return PromptTemplateRead(
        id=template.id,
        name=template.name,
        description=template.description,
        template=template.template,
        is_system=template.is_system,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def _llm_model_to_read(model: LLMModel) -> LLMModelRead:
    return LLMModelRead(
        id=model.id,
        name=model.name,
        base_url=model.base_url,
        model_name=model.model_name,
        description=model.description,
        is_system=model.is_system,
        masked_api_key=_mask_api_key(model.api_key),
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def _render_task_prompt(task_text: str, prompt_template: Optional[str]) -> str:
    template = prompt_template or DEFAULT_PROMPT_TEMPLATE
    try:
        if "{task}" in template:
            return template.format(task=task_text)
    except (KeyError, ValueError):  # pragma: no cover - defensive formatting
        pass
    cleaned_template = template.strip()
    return f"{cleaned_template}\n\nTask Instructions:\n{task_text}" if cleaned_template else task_text


async def _verify_openai_model(base_url: str, api_key: str, model_name: str) -> None:
    url = f"{base_url.rstrip('/')}/models/{model_name}"
    headers = {
        "Authorization": f"Bearer {api_key}",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, headers=headers)
    except httpx.HTTPError as exc:  # pragma: no cover - network dependent
        raise HTTPException(status_code=400, detail=f"Unable to reach model endpoint: {exc}") from exc

    if response.status_code == 200:
        return
    if response.status_code == 404:
        raise HTTPException(status_code=400, detail="Model not found at provided endpoint.")
    raise HTTPException(
        status_code=400,
        detail=f"Model verification failed with status {response.status_code}: {response.text[:200]}",
    )


async def _get_prompt_template(session: AsyncSession, prompt_id: int) -> PromptTemplate:
    prompt = await session.get(PromptTemplate, prompt_id)
    if prompt is None:
        raise HTTPException(status_code=404, detail="Prompt template not found.")
    return prompt


async def _get_llm_model(session: AsyncSession, model_id: int) -> LLMModel:
    model = await session.get(LLMModel, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="LLM model not found.")
    return model


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


async def _update_manual_run(
    run_id: int,
    *,
    status: Optional[str] = None,
    server_url: Optional[str] = None,
    xpra_url: Optional[str] = None,
    result: Optional[str] = None,
) -> None:
    async with AsyncSessionLocal() as session:
        run = await session.get(TestRun, run_id)
        if run is None:
            return

        changed = False
        now = datetime.utcnow()

        if status is not None:
            if run.status != status:
                run.status = status
                changed = True
            run.updated_at = now
            if status == "running" and run.started_at is None:
                run.started_at = now
                changed = True
            if status in {"completed", "failed", "cancelled"}:
                run.completed_at = now
                changed = True

        if server_url is not None and run.server_url != server_url:
            run.server_url = server_url
            run.updated_at = now
            changed = True

        if xpra_url is not None and run.xpra_url != xpra_url:
            run.xpra_url = xpra_url
            run.updated_at = now
            changed = True

        if result is not None and run.result != result:
            run.result = result
            run.completed_at = now
            run.updated_at = now
            changed = True

        if changed:
            await session.commit()


async def _log_manual_run(run_id: int, message: str, level: str = "info") -> None:
    async with AsyncSessionLocal() as session:
        run = await session.get(TestRun, run_id)
        if run is None:
            return
        await _append_run_log_entry(session, run, message, level)


async def _initialise_database() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def _ensure_default_records() -> None:
    default_prompt_name = os.getenv("DEFAULT_PROMPT_NAME", "Default Task Prompt")
    default_prompt_template = os.getenv("DEFAULT_PROMPT_TEMPLATE", DEFAULT_PROMPT_TEMPLATE)
    default_llm_name = os.getenv("DEFAULT_LLM_MODEL_NAME", "Configured Default Model")
    base_url = os.getenv("OPENAI_BASE_URL")
    api_key = os.getenv("OPENAI_API_KEY")
    model_name = os.getenv("OPENAI_MODEL")

    async with AsyncSessionLocal() as session:
        prompt_result = await session.execute(
            select(PromptTemplate).where(PromptTemplate.is_system.is_(True))
        )
        prompt = prompt_result.scalars().first()
        if prompt is None:
            session.add(
                PromptTemplate(
                    name=default_prompt_name,
                    description="Default prompt configured from environment.",
                    template=default_prompt_template,
                    is_system=True,
                )
            )
        else:
            updated = False
            if prompt.name != default_prompt_name:
                prompt.name = default_prompt_name
                updated = True
            if prompt.template != default_prompt_template:
                prompt.template = default_prompt_template
                updated = True
            if prompt.description != "Default prompt configured from environment.":
                prompt.description = "Default prompt configured from environment."
                updated = True
            if updated:
                prompt.updated_at = datetime.utcnow()

        if base_url and api_key and model_name:
            model_result = await session.execute(
                select(LLMModel).where(LLMModel.is_system.is_(True))
            )
            model = model_result.scalars().first()
            if model is None:
                session.add(
                    LLMModel(
                        name=default_llm_name,
                        base_url=str(base_url),
                        api_key=api_key,
                        model_name=model_name,
                        description="Default model configured from environment.",
                        is_system=True,
                    )
                )
            else:
                updated = False
                if model.name != default_llm_name:
                    model.name = default_llm_name
                    updated = True
                if model.base_url != str(base_url):
                    model.base_url = str(base_url)
                    updated = True
                if model.model_name != model_name:
                    model.model_name = model_name
                    updated = True
                if model.description != "Default model configured from environment.":
                    model.description = "Default model configured from environment."
                    updated = True
                if model.api_key != api_key:
                    model.api_key = api_key
                    updated = True
                if updated:
                    model.updated_at = datetime.utcnow()

        await session.commit()


async def _resume_queued_runs() -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestRun).where(TestRun.status.in_(["queued", "running", "pending"]))
        )
        runs = result.scalars().all()
        for run in runs:
            if run.status in {"running", "pending"}:
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

        if run.status not in {"queued", "pending"}:
            return

        test_case = await session.get(TestCase, run.test_case_id)
        if test_case is None:
            run.status = "failed"
            run.result = "missing-test-case"
            run.completed_at = datetime.utcnow()
            run.updated_at = datetime.utcnow()
            await _append_run_log_entry(session, run, "Test case not found", "error")
            return

        allocation: SessionDefinition | None = await SESSION_POOL.acquire_nowait()
        if allocation is None:
            run.status = "pending"
            run.updated_at = datetime.utcnow()
            await session.commit()
            await _append_run_log_entry(
                session,
                run,
                "Waiting for available MCP session.",
                "info",
            )
            allocation = await SESSION_POOL.acquire()

        run.status = "running"
        run.started_at = datetime.utcnow()
        run.updated_at = datetime.utcnow()
        run.server_url = allocation.server_url
        run.xpra_url = allocation.xpra_url
        await session.commit()

        await _append_run_log_entry(
            session,
            run,
            f"Assigned MCP session {allocation.identifier} ({allocation.server_url})",
            "info",
        )
        await _append_run_log_entry(
            session,
            run,
            f"Started run for {test_case.reference}: {test_case.title}",
            "info",
        )

        try:
            async for payload in run_agent(run.prompt, run.server_url, None, "{task}"):
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
        finally:
            if allocation is not None:
                with suppress(Exception):  # pragma: no cover - defensive
                    await SESSION_POOL.release(allocation)

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


@app.get("/prompts", response_model=List[PromptTemplateRead])
async def list_prompts(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(PromptTemplate).order_by(PromptTemplate.created_at.desc()))
    prompts = result.scalars().all()
    return [_prompt_to_read(prompt) for prompt in prompts]


@app.post("/prompts", response_model=PromptTemplateRead, status_code=201)
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
    return _prompt_to_read(prompt)


@app.put("/prompts/{prompt_id}", response_model=PromptTemplateRead)
async def update_prompt(
    prompt_id: int, payload: PromptTemplateUpdate, session: AsyncSession = Depends(get_db)
):
    prompt = await session.get(PromptTemplate, prompt_id)
    if prompt is None:
        raise HTTPException(status_code=404, detail="Prompt template not found.")
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
    return _prompt_to_read(prompt)


@app.delete("/prompts/{prompt_id}", status_code=204)
async def delete_prompt(prompt_id: int, session: AsyncSession = Depends(get_db)):
    prompt = await session.get(PromptTemplate, prompt_id)
    if prompt is None:
        raise HTTPException(status_code=404, detail="Prompt template not found.")
    if prompt.is_system:
        raise HTTPException(status_code=400, detail="System prompts cannot be deleted.")

    await session.delete(prompt)
    await session.commit()


@app.get("/llm-models", response_model=List[LLMModelRead])
async def list_llm_models(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(LLMModel).order_by(LLMModel.created_at.desc()))
    models = result.scalars().all()
    return [_llm_model_to_read(model) for model in models]


@app.post("/llm-models/verify")
async def verify_llm_model(payload: LLMModelVerify):
    await _verify_openai_model(str(payload.base_url), payload.api_key, payload.model_name)
    return {"status": "ok"}


@app.post("/llm-models", response_model=LLMModelRead, status_code=201)
async def create_llm_model(
    payload: LLMModelCreate, session: AsyncSession = Depends(get_db)
):
    await _verify_openai_model(str(payload.base_url), payload.api_key, payload.model_name)

    model = LLMModel(
        name=payload.name,
        base_url=str(payload.base_url),
        api_key=payload.api_key,
        model_name=payload.model_name,
        description=payload.description,
        is_system=False,
    )
    session.add(model)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Model name already exists.")
    await session.refresh(model)
    return _llm_model_to_read(model)


@app.put("/llm-models/{model_id}", response_model=LLMModelRead)
async def update_llm_model(
    model_id: int, payload: LLMModelUpdate, session: AsyncSession = Depends(get_db)
):
    model = await session.get(LLMModel, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="LLM model not found.")
    if model.is_system:
        raise HTTPException(status_code=400, detail="System models cannot be modified.")

    new_base_url = str(payload.base_url) if payload.base_url is not None else model.base_url
    new_api_key = payload.api_key if payload.api_key is not None else model.api_key
    new_model_name = payload.model_name if payload.model_name is not None else model.model_name

    if (
        new_base_url != model.base_url
        or new_api_key != model.api_key
        or new_model_name != model.model_name
    ):
        await _verify_openai_model(new_base_url, new_api_key, new_model_name)

    if payload.name is not None:
        model.name = payload.name
    if payload.description is not None:
        model.description = payload.description
    model.base_url = new_base_url
    model.api_key = new_api_key
    model.model_name = new_model_name

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Model name already exists.")
    await session.refresh(model)
    return _llm_model_to_read(model)


@app.delete("/llm-models/{model_id}", status_code=204)
async def delete_llm_model(model_id: int, session: AsyncSession = Depends(get_db)):
    model = await session.get(LLMModel, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="LLM model not found.")
    if model.is_system:
        raise HTTPException(status_code=400, detail="System models cannot be deleted.")

    await session.delete(model)
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

    prompt_override = payload.prompt
    if payload.prompt_id is not None:
        prompt_template = await _get_prompt_template(session, payload.prompt_id)
        prompt_override = prompt_template.template

    created_runs: List[TestRun] = []
    for case_id in payload.test_case_ids:
        test_case = test_cases[case_id]
        prompt = _build_prompt_for_case(test_case, prompt_override)
        run = TestRun(
            test_case_id=test_case.id,
            model_config_id=model_config_id,
            status="queued",
            prompt=prompt,
            server_url=None,
            xpra_url=None,
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


async def _register_task(
    task_id: str,
    task_text: str,
    *,
    status: str = "running",
    prompt: str | None = None,
    server_url: str | None = None,
    xpra_url: str | None = None,
) -> None:
    timestamp = datetime.utcnow().isoformat()
    mapping = {
        "task": task_text,
        "prompt": prompt or task_text,
        "status": status,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    if server_url:
        mapping["server_url"] = server_url
    if xpra_url:
        mapping["xpra_url"] = xpra_url

    await _safe_redis_call(
        redis_client.hset(
            f"task:{task_id}",
            mapping=mapping,
        )
    )
    await _safe_redis_call(redis_client.sadd("tasks:all", task_id))
    if status == "running":
        await _safe_redis_call(redis_client.sadd("tasks:active", task_id))
    elif status == "pending":
        await _safe_redis_call(redis_client.sadd("tasks:pending", task_id))


async def _update_task_metadata(task_id: str, mapping: Dict[str, Any]) -> None:
    status = mapping.get("status")
    if status is not None:
        for bucket in ["active", "pending", "completed", "failed", "cancelled"]:
            await _safe_redis_call(redis_client.srem(f"tasks:{bucket}", task_id))
        if status == "running":
            await _safe_redis_call(redis_client.sadd("tasks:active", task_id))
        elif status == "pending":
            await _safe_redis_call(redis_client.sadd("tasks:pending", task_id))
        else:
            await _safe_redis_call(redis_client.sadd(f"tasks:{status}", task_id))

    await _safe_redis_call(
        redis_client.hset(
            f"task:{task_id}",
            mapping={**mapping, "updated_at": datetime.utcnow().isoformat()},
        )
    )


async def _append_task_log(task_id: str, payload: str) -> None:
    entry = json.dumps({"timestamp": datetime.utcnow().isoformat(), "payload": payload})
    await _safe_redis_call(redis_client.rpush(f"task:{task_id}:log", entry))
    await _update_task_metadata(task_id, {})


async def _finalize_task(task_id: str, status: str) -> None:
    timestamp = datetime.utcnow().isoformat()
    await _safe_redis_call(redis_client.srem("tasks:active", task_id))
    await _safe_redis_call(redis_client.srem("tasks:pending", task_id))
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


def _truncate_text(text: str, limit: int = 160) -> str:
    collapsed = " ".join(str(text).split())
    if len(collapsed) <= limit:
        return collapsed
    return f"{collapsed[: limit - 1]}…"


def _extract_first_text(value: Any, preferred_keys: tuple[str, ...] = ()) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        for key in preferred_keys:
            if key in value:
                candidate = _extract_first_text(value[key], preferred_keys)
                if candidate:
                    return candidate
        for key in value:
            candidate = _extract_first_text(value[key], preferred_keys)
            if candidate:
                return candidate
        return None
    if isinstance(value, (list, tuple, set)):
        for item in value:
            candidate = _extract_first_text(item, preferred_keys)
            if candidate:
                return candidate
        return None
    if isinstance(value, BaseMessage):
        return _extract_first_text(value.content, preferred_keys)
    if hasattr(value, "model_dump"):
        try:
            dumped = value.model_dump()
        except Exception:  # pragma: no cover - defensive
            dumped = None
        if dumped is not None:
            return _extract_first_text(dumped, preferred_keys)
    if hasattr(value, "dict"):
        try:
            dumped = value.dict()
        except Exception:  # pragma: no cover - defensive
            dumped = None
        if dumped is not None:
            return _extract_first_text(dumped, preferred_keys)
    return None


def _prepare_stream_event(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _prepare_stream_event(val) for key, val in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_prepare_stream_event(item) for item in value]
    if isinstance(value, BaseMessage):
        return {"type": value.type, "content": _prepare_stream_event(value.content)}
    if hasattr(value, "model_dump"):
        try:
            dumped = value.model_dump()
        except Exception:  # pragma: no cover - defensive
            dumped = None
        if dumped is not None:
            return _prepare_stream_event(dumped)
    if hasattr(value, "dict"):
        try:
            dumped = value.dict()
        except Exception:  # pragma: no cover - defensive
            dumped = None
        if dumped is not None:
            return _prepare_stream_event(dumped)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _should_skip_stream_event(event: Dict[str, Any]) -> bool:
    event_type = str(event.get("event") or "")
    if event_type != "on_chat_model_stream":
        return False

    data = event.get("data")
    if not isinstance(data, dict):
        return False

    chunk = data.get("chunk")
    if isinstance(chunk, dict):
        chunk_type = chunk.get("type")
        if isinstance(chunk_type, str) and chunk_type == "AIMessageChunk":
            return True
    elif isinstance(chunk, str) and chunk == "AIMessageChunk":
        return True

    chunk_type = data.get("chunk_type")
    if isinstance(chunk_type, str) and chunk_type == "AIMessageChunk":
        return True

    return False


def _summarize_stream_event(event: Dict[str, Any]) -> tuple[str, Optional[str]]:
    event_type = str(event.get("event") or "")
    event_name = str(event.get("name") or "")
    data = event.get("data")
    snippet = _extract_first_text(
        data,
        (
            "message",
            "output",
            "observation",
            "text",
            "content",
            "input",
            "prompt",
            "tool_input",
            "tool_output",
            "result",
        ),
    )
    label_parts: list[str] = []
    if event_type:
        label_parts.append(event_type.replace("_", " ").title())
    if event_name:
        label_parts.append(event_name)
    message = " · ".join(label_parts) if label_parts else "Agent event"
    if snippet:
        message = f"{message}: {_truncate_text(snippet)}"

    result_text: Optional[str] = None
    if event_type == "on_chain_end":
        preferred_output = None
        if isinstance(data, dict):
            preferred_output = _extract_first_text(
                data.get("output"),
                ("output", "message", "text", "content", "result"),
            )
        if preferred_output:
            result_text = _truncate_text(preferred_output, limit=400)
        else:
            fallback = _extract_first_text(data)
            if fallback:
                result_text = _truncate_text(fallback, limit=400)

    return message, result_text


async def run_agent(
    task: str,
    server_url: str | None,
    llm_settings: Optional[Dict[str, str]],
    prompt_template: Optional[str],
) -> AsyncIterator[str]:
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

    if llm_settings:
        llm = ChatOpenAI(
            model=llm_settings["model_name"],
            base_url=llm_settings["base_url"],
            api_key=llm_settings["api_key"],
        )
    else:
        llm = ChatOpenAI(
            model=os.getenv("OPENAI_MODEL"),
            base_url=os.getenv("OPENAI_BASE_URL"),
            api_key=os.getenv("OPENAI_API_KEY"),
        )

    agent = MCPAgent(llm=llm, client=client, max_steps=30)

    final_prompt = _render_task_prompt(task, prompt_template)

    yield json.dumps({"type": "info", "message": "Starting task execution."})

    final_result: Optional[str] = None
    try:
        async for raw_event in agent.stream_events(final_prompt, max_steps=30):
            safe_event = _prepare_stream_event(raw_event)
            if _should_skip_stream_event(safe_event):
                continue
            message, result_candidate = _summarize_stream_event(safe_event)
            payload: Dict[str, Any] = {
                "type": "event",
                "message": message,
                "details": safe_event,
            }
            event_name = safe_event.get("event")
            if isinstance(event_name, str) and event_name:
                payload["eventName"] = event_name
            event_source = safe_event.get("name")
            if isinstance(event_source, str) and event_source:
                payload["eventSource"] = event_source
            yield json.dumps(payload)
            if result_candidate:
                final_result = result_candidate
    except Exception as exc:  # pragma: no cover - defensive
        yield json.dumps({"type": "error", "message": str(exc)})
        raise

    yield json.dumps({"type": "success", "message": "Task completed."})
    if final_result:
        yield json.dumps({"type": "result", "message": final_result})
    else:
        yield json.dumps({"type": "result", "message": "No final response returned."})


async def _activate_managed_task(
    task_id: str, managed_task: ManagedTask, allocation: SessionDefinition
) -> None:
    managed_task.session = allocation
    managed_task.server_url = allocation.server_url
    managed_task.xpra_url = allocation.xpra_url
    managed_task.status = "running"
    managed_task.waiter = None
    rendered_prompt = managed_task.rendered_prompt or _render_task_prompt(
        managed_task.task_text, managed_task.prompt_template
    )
    managed_task.rendered_prompt = rendered_prompt
    await _update_task_metadata(
        task_id,
        {
            "status": "running",
            "server_url": allocation.server_url,
            "xpra_url": allocation.xpra_url,
            "prompt": rendered_prompt,
        },
    )
    session_payload = json.dumps(
        {
            "type": "session",
            "message": f"Assigned MCP session {allocation.identifier}",
            "serverUrl": allocation.server_url,
            "xpraUrl": allocation.xpra_url,
        }
    )
    if managed_task.run_id is not None:
        await _update_manual_run(
            managed_task.run_id,
            server_url=allocation.server_url,
            xpra_url=allocation.xpra_url,
        )
        await _log_manual_run(
            managed_task.run_id,
            f"Assigned MCP session {allocation.identifier}",
            "info",
        )
    await managed_task.queue.put(session_payload)
    await _append_task_log(task_id, session_payload)
    managed_task.task = asyncio.create_task(_agent_worker(task_id, managed_task))


async def _await_session(task_id: str, managed_task: ManagedTask) -> None:
    try:
        allocation = await SESSION_POOL.acquire()
    except asyncio.CancelledError:
        managed_task.waiter = None
        raise

    if managed_task.cancel_requested:
        managed_task.waiter = None
        await SESSION_POOL.release(allocation)
        return

    managed_task.waiter = None
    await _activate_managed_task(task_id, managed_task, allocation)


async def _agent_worker(task_id: str, managed_task: ManagedTask) -> None:
    """Background worker that executes the MCP agent and streams output."""

    managed_task.status = "running"
    try:
        async for message in run_agent(
            managed_task.task_text,
            managed_task.server_url,
            managed_task.llm_settings,
            managed_task.prompt_template,
        ):
            await _append_task_log(task_id, message)
            await managed_task.queue.put(message)
            if managed_task.run_id is not None:
                try:
                    payload = json.loads(message)
                    msg_text = str(payload.get("message", ""))
                    msg_type = str(payload.get("type", "info"))
                except json.JSONDecodeError:
                    msg_text = message
                    msg_type = "info"
                await _log_manual_run(managed_task.run_id, msg_text, msg_type)
    except asyncio.CancelledError:
        managed_task.status = "cancelled"
        await managed_task.queue.put(
            json.dumps({"type": "cancelled", "message": "Task cancelled."})
        )
        await _append_task_log(
            task_id, json.dumps({"type": "cancelled", "message": "Task cancelled."})
        )
        if managed_task.run_id is not None:
            await _log_manual_run(
                managed_task.run_id,
                "Task cancelled.",
                "cancelled",
            )
        raise
    except Exception as exc:  # pragma: no cover - defensive
        managed_task.status = "failed"
        await managed_task.queue.put(
            json.dumps({"type": "error", "message": str(exc)})
        )
        await _append_task_log(task_id, json.dumps({"type": "error", "message": str(exc)}))
        if managed_task.run_id is not None:
            await _log_manual_run(managed_task.run_id, str(exc), "error")
    finally:
        if managed_task.status == "running":
            managed_task.status = "completed"
        await managed_task.queue.put(None)
        managed_task.done.set()
        try:
            await _finalize_task(task_id, managed_task.status)
        except Exception as exc:  # pragma: no cover - defensive
            await managed_task.queue.put(
                json.dumps({"type": "error", "message": f"Failed to finalize task: {exc}"})
            )
            if managed_task.run_id is not None:
                await _log_manual_run(
                    managed_task.run_id,
                    f"Failed to finalize task: {exc}",
                    "error",
                )
        else:
            if managed_task.status in {"completed", "failed", "cancelled"}:
                with suppress(Exception):  # pragma: no cover - defensive
                    await _persist_log_file(task_id)
            if managed_task.run_id is not None:
                result_value = (
                    "success" if managed_task.status == "completed" else managed_task.status
                )
                await _update_manual_run(
                    managed_task.run_id,
                    result=result_value,
                )
        if managed_task.session is not None:
            with suppress(Exception):  # pragma: no cover - defensive
                await SESSION_POOL.release(managed_task.session)
        async with _tasks_lock:
            _tasks.pop(task_id, None)


@app.post("/run-task")
async def run_task(request: TaskRequest):
    task_text = request.task.strip()
    if not task_text:
        raise HTTPException(status_code=400, detail="Task cannot be empty.")

    task_id = uuid.uuid4().hex
    prompt_template: Optional[str] = None
    llm_settings: Optional[Dict[str, str]] = None

    async with AsyncSessionLocal() as session:
        if request.prompt_id is not None:
            prompt_template = (await _get_prompt_template(session, request.prompt_id)).template
        elif request.prompt_text:
            prompt_template = request.prompt_text

        if request.model_id is not None:
            model = await _get_llm_model(session, request.model_id)
            llm_settings = {
                "model_name": model.model_name,
                "base_url": model.base_url,
                "api_key": model.api_key,
            }

    managed_task = ManagedTask(task_text=task_text, prompt_template=prompt_template, llm_settings=llm_settings)

    async with _tasks_lock:
        _tasks[task_id] = managed_task

    initial_prompt = _render_task_prompt(task_text, prompt_template)
    managed_task.rendered_prompt = initial_prompt

    if request.save_to_history:
        async with AsyncSessionLocal() as session:
            test_case: TestCase | None = None
            if request.test_case_id is not None:
                test_case = await session.get(TestCase, request.test_case_id)

            if test_case is None:
                generated_reference = f"DRAFT-{uuid.uuid4().hex[:6].upper()}"
                title_source = task_text.splitlines()[0].strip() if task_text.splitlines() else ""
                title = title_source[:120] if title_source else generated_reference
                tags = _dump_list(["manual"])
                steps = _dump_list(
                    [line.strip() for line in task_text.splitlines() if line.strip()]
                )
                test_case = TestCase(
                    reference=generated_reference,
                    title=title,
                    description=task_text,
                    category="Manual",
                    priority="Medium",
                    status="Draft",
                    tags=tags,
                    steps=steps,
                )
                session.add(test_case)
                await session.commit()
                await session.refresh(test_case)

            managed_task.test_case_reference = test_case.reference
            run_record = TestRun(
                test_case_id=test_case.id,
                model_config_id=None,
                status="draft",
                prompt=initial_prompt,
                server_url=None,
                xpra_url=None,
                task_id=task_id,
                log="[]",
                metrics="{}",
            )
            session.add(run_record)
            await session.commit()
            await session.refresh(run_record)
            await _append_run_log_entry(
                session,
                run_record,
                f"Manual run captured for later review (Test Case {test_case.reference}).",
                "info",
            )
            managed_task.run_id = run_record.id
            managed_task.test_case_id = test_case.id

    allocation: SessionDefinition | None = None
    try:
        allocation = await SESSION_POOL.acquire_nowait()
        if allocation is None:
            managed_task.status = "pending"
            await _register_task(
                task_id,
                task_text,
                status="pending",
                prompt=initial_prompt,
            )
            waiting_payload = json.dumps(
                {
                    "type": "info",
                    "message": "Waiting for available MCP session.",
                }
            )
            await _append_task_log(task_id, waiting_payload)
            await managed_task.queue.put(waiting_payload)
            if managed_task.run_id is not None:
                await _log_manual_run(
                    managed_task.run_id,
                    "Waiting for available MCP session.",
                    "info",
                )
            managed_task.waiter = asyncio.create_task(_await_session(task_id, managed_task))
        else:
            managed_task.status = "running"
            managed_task.server_url = allocation.server_url
            managed_task.xpra_url = allocation.xpra_url
            await _register_task(
                task_id,
                task_text,
                status="running",
                prompt=initial_prompt,
                server_url=allocation.server_url,
                xpra_url=allocation.xpra_url,
            )
            if managed_task.run_id is not None:
                await _update_manual_run(
                    managed_task.run_id,
                    server_url=allocation.server_url,
                    xpra_url=allocation.xpra_url,
                )
                await _log_manual_run(
                    managed_task.run_id,
                    f"Assigned MCP session {allocation.identifier}",
                    "info",
                )
            await _activate_managed_task(task_id, managed_task, allocation)
            allocation = None  # ownership transferred to managed task
    except RuntimeError as exc:
        async with _tasks_lock:
            _tasks.pop(task_id, None)
        if allocation is not None:
            with suppress(Exception):  # pragma: no cover - defensive
                await SESSION_POOL.release(allocation)
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    async def event_stream() -> AsyncIterator[bytes]:
        initial_payload = json.dumps(
            {
                "type": "task",
                "taskId": task_id,
                "status": managed_task.status,
                "serverUrl": managed_task.server_url,
                "xpraUrl": managed_task.xpra_url,
                "runId": managed_task.run_id,
                "testCaseId": managed_task.test_case_id,
                "testCaseReference": managed_task.test_case_reference,
            }
        )
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

    if managed_task is None:
        raise HTTPException(status_code=404, detail="Task not found or already completed.")

    if managed_task.task is None:
        managed_task.cancel_requested = True
        if managed_task.waiter is not None:
            managed_task.waiter.cancel()
            with suppress(asyncio.CancelledError):
                await managed_task.waiter
            managed_task.waiter = None
        cancel_payload = json.dumps({"type": "cancelled", "message": "Task cancelled."})
        await _append_task_log(task_id, cancel_payload)
        await managed_task.queue.put(cancel_payload)
        await managed_task.queue.put(None)
        managed_task.done.set()
        await _finalize_task(task_id, "cancelled")
        async with _tasks_lock:
            _tasks.pop(task_id, None)
        return {"status": "cancelled"}

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
        pending = await _fetch_task_list("tasks:pending")
        completed = await _fetch_task_list("tasks:completed")
        cancelled = await _fetch_task_list("tasks:cancelled")
        failed = await _fetch_task_list("tasks:failed")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "active": active,
        "pending": pending,
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
