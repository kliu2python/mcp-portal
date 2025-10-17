from __future__ import annotations

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from fastapi import HTTPException
from redis.exceptions import RedisError

from ..core.settings import LOG_DIR, get_redis_client

redis_client = get_redis_client()


async def safe_redis_call(coro):
    try:
        return await coro
    except RedisError as exc:  # pragma: no cover - defensive
        raise RuntimeError(f"Redis operation failed: {exc}") from exc


async def register_task(
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

    await safe_redis_call(
        redis_client.hset(
            f"task:{task_id}",
            mapping=mapping,
        )
    )
    await safe_redis_call(redis_client.sadd("tasks:all", task_id))
    if status == "running":
        await safe_redis_call(redis_client.sadd("tasks:active", task_id))
    elif status == "pending":
        await safe_redis_call(redis_client.sadd("tasks:pending", task_id))


async def update_task_metadata(task_id: str, mapping: Dict[str, Any]) -> None:
    status = mapping.get("status")
    if status is not None:
        for bucket in ["active", "pending", "completed", "failed", "cancelled"]:
            await safe_redis_call(redis_client.srem(f"tasks:{bucket}", task_id))
        if status == "running":
            await safe_redis_call(redis_client.sadd("tasks:active", task_id))
        elif status == "pending":
            await safe_redis_call(redis_client.sadd("tasks:pending", task_id))
        else:
            await safe_redis_call(redis_client.sadd(f"tasks:{status}", task_id))

    await safe_redis_call(
        redis_client.hset(
            f"task:{task_id}",
            mapping={**mapping, "updated_at": datetime.utcnow().isoformat()},
        )
    )


async def append_task_log(task_id: str, payload: str) -> None:
    entry = json.dumps({"timestamp": datetime.utcnow().isoformat(), "payload": payload})
    await safe_redis_call(redis_client.rpush(f"task:{task_id}:log", entry))
    await update_task_metadata(task_id, {})


async def finalize_task(task_id: str, status: str) -> None:
    timestamp = datetime.utcnow().isoformat()
    await safe_redis_call(redis_client.srem("tasks:active", task_id))
    await safe_redis_call(redis_client.srem("tasks:pending", task_id))
    await safe_redis_call(redis_client.srem("tasks:completed", task_id))
    await safe_redis_call(redis_client.srem("tasks:failed", task_id))
    await safe_redis_call(redis_client.srem("tasks:cancelled", task_id))
    await safe_redis_call(redis_client.sadd(f"tasks:{status}", task_id))
    await safe_redis_call(
        redis_client.hset(
            f"task:{task_id}",
            mapping={"status": status, "completed_at": timestamp, "updated_at": timestamp},
        )
    )


async def get_task_metadata(task_id: str) -> Dict[str, str]:
    data = await safe_redis_call(redis_client.hgetall(f"task:{task_id}"))
    if not data:
        raise HTTPException(status_code=404, detail="Task not found.")
    data["task_id"] = task_id
    return data


async def ensure_log_directory() -> None:
    await asyncio.to_thread(LOG_DIR.mkdir, parents=True, exist_ok=True)


async def persist_log_file(task_id: str) -> Path:
    await ensure_log_directory()
    entries: List[str] = await safe_redis_call(redis_client.lrange(f"task:{task_id}:log", 0, -1))
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

    await safe_redis_call(
        redis_client.hset(
            f"task:{task_id}",
            mapping={"log_file": str(log_path)},
        )
    )

    return log_path


async def get_or_create_log_file(task_id: str) -> Path:
    metadata = await get_task_metadata(task_id)
    existing = metadata.get("log_file")
    if existing:
        path = Path(existing)
        if path.exists():
            return path
    return await persist_log_file(task_id)


async def fetch_task_list(set_name: str) -> List[Dict[str, str]]:
    task_ids = await safe_redis_call(redis_client.smembers(set_name))
    results: List[Dict[str, str]] = []
    for task_id in task_ids:
        try:
            results.append(await get_task_metadata(task_id))
        except HTTPException:
            continue
    results.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return results


async def get_task_log_entries(task_id: str) -> List[Dict[str, object]]:
    entries = await safe_redis_call(redis_client.lrange(f"task:{task_id}:log", 0, -1))
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


async def get_task_log_length(task_id: str) -> int:
    length = await safe_redis_call(redis_client.llen(f"task:{task_id}:log"))
    return int(length or 0)
