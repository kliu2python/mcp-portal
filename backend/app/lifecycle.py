from __future__ import annotations

import os

from fastapi import FastAPI

from .services.test_runs import (
    ensure_default_records,
    initialise_database,
    resume_queued_runs,
    start_worker_pool,
    stop_worker_pool,
)


def register_events(app: FastAPI) -> None:
    @app.on_event("startup")
    async def _on_startup() -> None:
        await initialise_database()
        await ensure_default_records()
        await resume_queued_runs()
        worker_count = int(os.getenv("TEST_RUN_WORKERS", "2"))
        await start_worker_pool(worker_count)

    @app.on_event("shutdown")
    async def _on_shutdown() -> None:
        await stop_worker_pool()
