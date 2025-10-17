from __future__ import annotations

from fastapi import FastAPI

from .routes import health, llm_models, model_configs, prompts, tasks, test_cases, test_runs


def register_routes(app: FastAPI) -> None:
    app.include_router(test_cases.router)
    app.include_router(model_configs.router)
    app.include_router(prompts.router)
    app.include_router(llm_models.router)
    app.include_router(test_runs.router)
    app.include_router(tasks.router)
    app.include_router(health.router)
