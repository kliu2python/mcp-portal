from __future__ import annotations

import asyncio
import json
import uuid
from contextlib import suppress
from typing import Any, AsyncIterator, Dict, Optional

from fastapi import HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from backend.mcp import stream_agent_events

from ..db.session import AsyncSessionLocal
from ..models import TestCase, TestRun
from ..schemas import TaskRequest
from ..services.llm import get_llm_model, get_prompt_template
from ..services.prompts import render_task_prompt
from ..services.session_pool import SESSION_POOL, SessionDefinition
from ..services.task_registry import (
    append_task_log,
    fetch_task_list,
    finalize_task,
    get_or_create_log_file,
    get_task_log_entries,
    get_task_metadata,
    get_task_log_length,
    persist_log_file,
    register_task,
    update_task_metadata,
)
from ..services.test_runs import append_run_log_entry, log_manual_run, update_manual_run
from ..services.vector_memory import append_memory_to_text, fetch_relevant_memory
from ..utils.json import dump_list, load_string_list


class ManagedTask:
    """Represents an asynchronously executing MCP task."""

    def __init__(
        self,
        *,
        task_text: str,
        prompt_template: Optional[str],
        llm_settings: Optional[Dict[str, str]],
        base_task_text: Optional[str] = None,
    ) -> None:
        self.task_text = task_text
        self.base_task_text = base_task_text or task_text
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


async def _activate_managed_task(
    task_id: str, managed_task: ManagedTask, allocation: SessionDefinition
) -> None:
    managed_task.session = allocation
    managed_task.server_url = allocation.server_url
    managed_task.xpra_url = allocation.xpra_url
    managed_task.status = "running"
    managed_task.waiter = None
    rendered_prompt = managed_task.rendered_prompt or render_task_prompt(
        managed_task.task_text, managed_task.prompt_template
    )
    managed_task.rendered_prompt = rendered_prompt
    await update_task_metadata(
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
        await update_manual_run(
            managed_task.run_id,
            server_url=allocation.server_url,
            xpra_url=allocation.xpra_url,
        )
        await log_manual_run(
            managed_task.run_id,
            f"Assigned MCP session {allocation.identifier}",
            "info",
        )
    await managed_task.queue.put(session_payload)
    await append_task_log(task_id, session_payload)
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
        async for message in stream_agent_events(
            managed_task.task_text,
            managed_task.server_url,
            managed_task.llm_settings,
            managed_task.prompt_template,
            render_task_prompt,
        ):
            await append_task_log(task_id, message)
            await managed_task.queue.put(message)
            if managed_task.run_id is not None:
                try:
                    payload = json.loads(message)
                    msg_text = str(payload.get("message", ""))
                    msg_type = str(payload.get("type", "info"))
                except json.JSONDecodeError:
                    msg_text = message
                    msg_type = "info"
                await log_manual_run(managed_task.run_id, msg_text, msg_type)
    except asyncio.CancelledError:
        managed_task.status = "cancelled"
        cancel_payload = json.dumps({"type": "cancelled", "message": "Task cancelled."})
        await managed_task.queue.put(cancel_payload)
        await append_task_log(task_id, cancel_payload)
        if managed_task.run_id is not None:
            await log_manual_run(managed_task.run_id, "Task cancelled.", "cancelled")
        raise
    except Exception as exc:  # pragma: no cover - defensive
        managed_task.status = "failed"
        error_payload = json.dumps({"type": "error", "message": str(exc)})
        await managed_task.queue.put(error_payload)
        await append_task_log(task_id, error_payload)
        if managed_task.run_id is not None:
            await log_manual_run(managed_task.run_id, str(exc), "error")
    finally:
        if managed_task.status == "running":
            managed_task.status = "completed"
        await managed_task.queue.put(None)
        managed_task.done.set()
        try:
            await finalize_task(task_id, managed_task.status)
        except Exception as exc:  # pragma: no cover - defensive
            error_payload = json.dumps(
                {"type": "error", "message": f"Failed to finalize task: {exc}"}
            )
            await managed_task.queue.put(error_payload)
            if managed_task.run_id is not None:
                await log_manual_run(
                    managed_task.run_id,
                    f"Failed to finalize task: {exc}",
                    "error",
                )
        else:
            if managed_task.status in {"completed", "failed", "cancelled"}:
                with suppress(Exception):  # pragma: no cover - defensive
                    await persist_log_file(task_id)
            if managed_task.run_id is not None:
                result_value = (
                    "success" if managed_task.status == "completed" else managed_task.status
                )
                await update_manual_run(
                    managed_task.run_id,
                    result=result_value,
                )
        if managed_task.session is not None:
            with suppress(Exception):  # pragma: no cover - defensive
                await SESSION_POOL.release(managed_task.session)
        async with _tasks_lock:
            _tasks.pop(task_id, None)


async def run_task(request: TaskRequest) -> StreamingResponse:
    task_text = request.task.strip()
    if not task_text:
        raise HTTPException(status_code=400, detail="Task cannot be empty.")

    task_id = uuid.uuid4().hex
    prompt_template: Optional[str] = None
    llm_settings: Optional[Dict[str, str]] = None

    base_task_text = task_text
    memory_matches = []

    async with AsyncSessionLocal() as session:
        query_text = base_task_text
        tag_source: list[str] = []
        if request.test_case_id is not None:
            linked_case = await session.get(TestCase, request.test_case_id)
            if linked_case is not None:
                tags = load_string_list(linked_case.tags)
                tag_source = tags
                description = linked_case.description or ""
                query_parts = [linked_case.title, description, " ".join(tags)]
                query_text = " \n".join(part for part in query_parts if part)
        memory_matches = await fetch_relevant_memory(
            session,
            query_text=query_text,
            tags=tag_source,
            limit=3,
        )

    task_text = append_memory_to_text(task_text, memory_matches)

    async with AsyncSessionLocal() as session:
        if request.prompt_id is not None:
            prompt_template = (await get_prompt_template(session, request.prompt_id)).template
        elif request.prompt_text:
            prompt_template = request.prompt_text

        if request.model_id is not None:
            model = await get_llm_model(session, request.model_id)
            llm_settings = {
                "model_name": model.model_name,
                "base_url": model.base_url,
                "api_key": model.api_key,
            }

    managed_task = ManagedTask(
        task_text=task_text,
        prompt_template=prompt_template,
        llm_settings=llm_settings,
        base_task_text=base_task_text,
    )

    async with _tasks_lock:
        _tasks[task_id] = managed_task

    initial_prompt = render_task_prompt(task_text, prompt_template)
    managed_task.rendered_prompt = initial_prompt

    if request.save_to_history:
        async with AsyncSessionLocal() as session:
            test_case: TestCase | None = None
            if request.test_case_id is not None:
                test_case = await session.get(TestCase, request.test_case_id)

            if test_case is None:
                generated_reference = f"DRAFT-{uuid.uuid4().hex[:6].upper()}"
                title_source = base_task_text.splitlines()[0].strip() if base_task_text.splitlines() else ""
                title = title_source[:120] if title_source else generated_reference
                tags = dump_list(["manual"])
                steps = dump_list([line.strip() for line in base_task_text.splitlines() if line.strip()])
                test_case = TestCase(
                    reference=generated_reference,
                    title=title,
                    description=base_task_text,
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
            await append_run_log_entry(
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
            await register_task(
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
            await append_task_log(task_id, waiting_payload)
            await managed_task.queue.put(waiting_payload)
            if managed_task.run_id is not None:
                await log_manual_run(
                    managed_task.run_id,
                    "Waiting for available MCP session.",
                    "info",
                )
            managed_task.waiter = asyncio.create_task(_await_session(task_id, managed_task))
        else:
            managed_task.status = "running"
            managed_task.server_url = allocation.server_url
            managed_task.xpra_url = allocation.xpra_url
            await register_task(
                task_id,
                task_text,
                status="running",
                prompt=initial_prompt,
                server_url=allocation.server_url,
                xpra_url=allocation.xpra_url,
            )
            if managed_task.run_id is not None:
                await update_manual_run(
                    managed_task.run_id,
                    server_url=allocation.server_url,
                    xpra_url=allocation.xpra_url,
                )
                await log_manual_run(
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
            await append_task_log(task_id, initial_payload)
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


async def cancel_task(task_id: str) -> Dict[str, str]:
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
        await append_task_log(task_id, cancel_payload)
        await managed_task.queue.put(cancel_payload)
        await managed_task.queue.put(None)
        await finalize_task(task_id, "cancelled")
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


async def list_tasks() -> Dict[str, Any]:
    try:
        active = await fetch_task_list("tasks:active")
        pending = await fetch_task_list("tasks:pending")
        completed = await fetch_task_list("tasks:completed")
        cancelled = await fetch_task_list("tasks:cancelled")
        failed = await fetch_task_list("tasks:failed")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "active": active,
        "pending": pending,
        "completed": completed,
        "cancelled": cancelled,
        "failed": failed,
    }


async def get_task(task_id: str) -> Dict[str, Any]:
    try:
        metadata = await get_task_metadata(task_id)
        log_length = await get_task_log_length(task_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    metadata["log_length"] = log_length
    return metadata


async def get_task_log(task_id: str) -> Dict[str, Any]:
    try:
        await get_task_metadata(task_id)
        entries = await get_task_log_entries(task_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {"task_id": task_id, "entries": entries}


async def persist_task_log_file(task_id: str) -> Dict[str, Any]:
    try:
        path = await persist_log_file(task_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {"task_id": task_id, "log_file": str(path)}


async def get_task_log_file(task_id: str) -> FileResponse:
    try:
        log_path = await get_or_create_log_file(task_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if not log_path.exists():  # pragma: no cover - defensive
        raise HTTPException(status_code=404, detail="Log file not found.")

    filename = f"task-{task_id}.txt"
    return FileResponse(log_path, media_type="text/plain", filename=filename)
