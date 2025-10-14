from __future__ import annotations

import asyncio
import json
import os
import uuid
from contextlib import suppress
from datetime import datetime
from pathlib import Path
from typing import AsyncIterator, Dict, List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, HttpUrl

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


class TaskRequest(BaseModel):
    task: str
    server_url: HttpUrl | None = None


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
