from __future__ import annotations

import asyncio
import json
import os
from contextlib import suppress
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.mcp import stream_agent_events

from ..db.base import Base
from ..db.session import AsyncSessionLocal, engine
from ..models import LLMModel, PromptTemplate, TestCase, TestRun
from ..schemas import QualityCategoryInsight, QualityInsightsResponse
from ..services.prompts import DEFAULT_PROMPT_TEMPLATE, render_task_prompt
from ..services.session_pool import SESSION_POOL, SessionDefinition
from ..utils.json import dump_dict, load_dict, load_json_list, load_string_list

run_queue: asyncio.Queue[int] = asyncio.Queue()
_run_workers: List[asyncio.Task[Any]] = []


async def initialise_database() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def ensure_default_records() -> None:
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


async def resume_queued_runs() -> None:
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


async def append_run_log_entry(
    session: AsyncSession, run: TestRun, message: str, level: str = "info"
) -> None:
    log_entries = load_json_list(run.log)
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


async def update_manual_run(
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


async def log_manual_run(run_id: int, message: str, level: str = "info") -> None:
    async with AsyncSessionLocal() as session:
        run = await session.get(TestRun, run_id)
        if run is None:
            return
        await append_run_log_entry(session, run, message, level)


async def process_test_run(run_id: int) -> None:
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
            await append_run_log_entry(session, run, "Test case not found", "error")
            return

        allocation: SessionDefinition | None = await SESSION_POOL.acquire_nowait()
        if allocation is None:
            run.status = "pending"
            run.updated_at = datetime.utcnow()
            await session.commit()
            await append_run_log_entry(
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

        await append_run_log_entry(
            session,
            run,
            f"Assigned MCP session {allocation.identifier} ({allocation.server_url})",
            "info",
        )
        await append_run_log_entry(
            session,
            run,
            f"Started run for {test_case.reference}: {test_case.title}",
            "info",
        )

        try:
            async for payload in stream_agent_events(
                run.prompt,
                run.server_url,
                None,
                "{task}",
                render_task_prompt,
            ):
                try:
                    data = json.loads(payload)
                    message_type = str(data.get("type", "info"))
                    message_text = str(data.get("message", ""))
                except json.JSONDecodeError:
                    message_type = "info"
                    message_text = payload

                await append_run_log_entry(session, run, message_text, message_type)
        except Exception as exc:  # pragma: no cover - defensive
            await append_run_log_entry(
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
            metrics = load_dict(run.metrics)
            metrics["duration"] = duration
            run.metrics = dump_dict(metrics)
        await session.commit()

        await append_run_log_entry(
            session,
            run,
            "Run completed successfully.",
            "success",
        )


async def run_worker(worker_index: int) -> None:
    while True:
        run_id = await run_queue.get()
        try:
            await process_test_run(run_id)
        except Exception as exc:  # pragma: no cover - defensive
            async with AsyncSessionLocal() as session:
                run = await session.get(TestRun, run_id)
                if run is not None:
                    run.status = "failed"
                    run.result = "error"
                    run.updated_at = datetime.utcnow()
                    await append_run_log_entry(
                        session,
                        run,
                        f"Worker {worker_index} encountered an error: {exc}",
                        "error",
                    )
        finally:
            run_queue.task_done()


async def start_worker_pool(worker_count: int) -> None:
    for index in range(worker_count):
        task = asyncio.create_task(run_worker(index))
        _run_workers.append(task)


async def stop_worker_pool() -> None:
    for task in _run_workers:
        task.cancel()
    for task in _run_workers:
        with suppress(asyncio.CancelledError):
            await task
    _run_workers.clear()


def build_prompt_for_case(test_case: TestCase, override_prompt: Optional[str]) -> str:
    if override_prompt:
        return override_prompt

    steps = load_string_list(test_case.steps)
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


def compute_quality_insights(
    cases: List[TestCase], runs: List[TestRun]
) -> QualityInsightsResponse:
    ready_count = sum(1 for case in cases if case.status == "Ready")
    blocked_count = sum(1 for case in cases if case.status == "Blocked")
    draft_count = sum(1 for case in cases if case.status == "Draft")

    total_runs = len(runs)
    pass_count = sum(1 for run in runs if run.result == "success")
    fail_count = sum(1 for run in runs if run.status == "failed")
    success_rate = (pass_count / total_runs * 100) if total_runs else 0.0

    durations: List[float] = []
    latest_run_at: Optional[datetime] = None
    for run in runs:
        metrics = load_dict(run.metrics)
        duration = metrics.get("duration")
        if isinstance(duration, (int, float)):
            durations.append(float(duration))
        completed_at = run.completed_at or run.updated_at or run.created_at
        if completed_at and (latest_run_at is None or completed_at > latest_run_at):
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
