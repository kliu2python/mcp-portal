from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

import redis.asyncio as redis

load_dotenv()

LOG_DIR = Path(os.getenv("TASK_LOG_DIR", "task_logs"))

_DEFAULT_DB_PATH = Path(
    os.getenv("DATABASE_FILE", Path(__file__).resolve().parents[1] / "data.db")
)

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL is None:
    _DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATABASE_URL = f"sqlite+aiosqlite:///{_DEFAULT_DB_PATH}"


@lru_cache(maxsize=1)
def get_redis_client() -> "redis.Redis":
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    return redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
