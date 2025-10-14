import json
import os
from typing import AsyncIterator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from langchain_openai import ChatOpenAI
from mcp_use import MCPAgent, MCPClient

load_dotenv()

app = FastAPI(title="MCP Portal Backend")

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


@app.post("/run-task")
async def run_task(request: TaskRequest):
    if not request.task.strip():
        raise HTTPException(status_code=400, detail="Task cannot be empty.")

    async def event_stream() -> AsyncIterator[bytes]:
        try:
            async for message in run_agent(request.task):
                yield f"data: {message}\n\n".encode("utf-8")
        except Exception as exc:
            error_payload = json.dumps({"type": "error", "message": str(exc)})
            yield f"data: {error_payload}\n\n".encode("utf-8")
        finally:
            yield b"data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
