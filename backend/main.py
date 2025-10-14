from __future__ import annotations

import asyncio
import json
import os
import uuid
from contextlib import suppress
from typing import AsyncIterator, Dict

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from langchain_openai import ChatOpenAI
from mcp_use import MCPAgent, MCPClient

load_dotenv()

app = FastAPI(title="MCP Portal Backend")


class ManagedTask:
    """Represents an asynchronously executing MCP task."""

    def __init__(self, prompt: str) -> None:
        self.prompt = prompt
        self.queue: asyncio.Queue[str | None] = asyncio.Queue()
        self.task: asyncio.Task | None = None
        self.done = asyncio.Event()


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


async def run_agent(task: str) -> AsyncIterator[str]:
    load_dotenv()

    config = {
        "mcpServers": {
            "http": {
                "url": "http://10.160.13.110:8882/sse",
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

    try:
        async for message in run_agent(managed_task.prompt):
            await managed_task.queue.put(message)
    except asyncio.CancelledError:
        await managed_task.queue.put(
            json.dumps({"type": "cancelled", "message": "Task cancelled."})
        )
        raise
    except Exception as exc:  # pragma: no cover - defensive
        await managed_task.queue.put(
            json.dumps({"type": "error", "message": str(exc)})
        )
    finally:
        await managed_task.queue.put(None)
        managed_task.done.set()
        async with _tasks_lock:
            _tasks.pop(task_id, None)


@app.post("/run-task")
async def run_task(request: TaskRequest):
    if not request.task.strip():
        raise HTTPException(status_code=400, detail="Task cannot be empty.")

    task_id = uuid.uuid4().hex
    managed_task = ManagedTask(prompt=request.task)

    async with _tasks_lock:
        _tasks[task_id] = managed_task

    managed_task.task = asyncio.create_task(_agent_worker(task_id, managed_task))

    async def event_stream() -> AsyncIterator[bytes]:
        initial_payload = json.dumps({"type": "task", "taskId": task_id})
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


@app.get("/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
