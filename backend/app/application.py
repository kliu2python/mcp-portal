from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.router import register_routes
from .lifecycle import register_events


def create_app() -> FastAPI:
    app = FastAPI(title="MCP Portal Backend")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_routes(app)
    register_events(app)

    return app
