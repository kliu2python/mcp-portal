from __future__ import annotations

from fastapi import APIRouter

from ...schemas import TaskRequest
from ...services.tasks import (
    cancel_task,
    get_task,
    get_task_log,
    get_task_log_file,
    list_tasks,
    persist_task_log_file,
    run_task,
)

router = APIRouter()


@router.post("/run-task")
async def run_task_endpoint(request: TaskRequest):
    return await run_task(request)


@router.post("/tasks/{task_id}/cancel")
async def cancel_task_endpoint(task_id: str):
    return await cancel_task(task_id)


@router.get("/tasks")
async def list_tasks_endpoint():
    return await list_tasks()


@router.get("/tasks/{task_id}")
async def get_task_endpoint(task_id: str):
    return await get_task(task_id)


@router.get("/tasks/{task_id}/log")
async def get_task_log_endpoint(task_id: str):
    return await get_task_log(task_id)


@router.post("/tasks/{task_id}/log/persist")
async def persist_task_log_endpoint(task_id: str):
    return await persist_task_log_file(task_id)


@router.get("/tasks/{task_id}/log/download")
async def download_task_log_endpoint(task_id: str):
    return await get_task_log_file(task_id)
