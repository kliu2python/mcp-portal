# MCP Portal Deployment

This repository contains a React frontend and a FastAPI backend for the MCP portal. The stack now ships with containerized deployment assets and Redis-backed task/session management.

## Prerequisites

- Docker and Docker Compose
- An OpenAI compatible API key if you intend to run MCP tasks (set `OPENAI_API_KEY`)

## Running with Docker Compose

1. Copy your environment variables into a `.env` file (optional) or export them in your shell:

   ```bash
   export OPENAI_API_KEY=sk-...
   export OPENAI_MODEL=gpt-4.1-mini
   export OPENAI_BASE_URL=https://api.openai.com/v1
   export REACT_APP_API_BASE_URL=http://localhost:8000
   ```

2. Build and start the services:

   ```bash
   docker-compose up --build
   ```

   This starts three containers:

   - **redis** – stores active/previous task metadata and console streams.
   - **backend** – FastAPI application on `http://localhost:8000`.
   - **frontend** – Static React build served on `http://localhost:3000`.

3. Visit `http://localhost:3000` in your browser.

### Persistent Task Logs

Task output is streamed into Redis and persisted to text files under `backend/task_logs`. The directory is mounted into the backend container so logs survive restarts.

You can download a task log via the API:

```bash
curl -LO http://localhost:8000/tasks/<task_id>/log/download
```

## Building and publishing Docker images

The repository ships with a helper script that builds both the frontend and backend images and (optionally) pushes them to a registry. This avoids running two separate `docker build` commands every time you update the stack.

```
# Build both images and tag them under your registry/namespace
./scripts/build-images.sh -r ghcr.io/your-org -t v1.2.3

# Build and push (requires registry login)
./scripts/build-images.sh -r ghcr.io/your-org -t v1.2.3 --push
```

Use `./scripts/build-images.sh --help` to see the available options, including how to override the API base URL used during the frontend build.

## Deploying to Kubernetes

A set of manifests that mirror the docker-compose stack is available in [`k8s/mcp-portal.yaml`](k8s/mcp-portal.yaml). The accompanying [`k8s/README.md`](k8s/README.md) explains how to build/push the images, create the required secrets, and apply the manifests to a cluster.

## Backend API Enhancements

- Redis now tracks active, completed, cancelled, and failed tasks along with their console output.
- `/tasks` and related endpoints expose task history, logs, and downloadable text files for long-term storage.
- Console logs are persisted automatically at task completion and remain available via Redis for replay or future storage solutions.

## Backend project structure

The FastAPI backend is organized under `backend/app` using a modular layout inspired by ftnt-qa-gpt:

- `backend/app/api/` – route definitions grouped by resource (test cases, LLM models, tasks, etc.).
- `backend/app/models/` – SQLAlchemy ORM models.
- `backend/app/schemas/` – Pydantic request/response models.
- `backend/app/services/` – shared business logic (run queue, task orchestration, MCP helpers).
- `backend/app/core/` and `backend/app/db/` – application configuration, Redis helpers, and database session management.

`backend/main.py` now simply instantiates the application via `backend.app.create_app()`, making it easier to extend individual layers without touching the entry point.

## Development Notes

- The frontend build embeds `REACT_APP_API_BASE_URL` at compile time. Override the default during build with:

  ```bash
  REACT_APP_API_BASE_URL=http://your-backend:8000 docker-compose build frontend
  ```

- To run the backend locally without Docker, install dependencies and start Uvicorn:

  ```bash
  pip install -r backend/requirements.txt
  uvicorn backend.main:app --reload
  ```

  Ensure `REDIS_URL` points to an accessible Redis instance.

### Configuring MCP servers and OTP support

The backend automatically wires MCP client connections for every task. By default it targets a single Chrome DevTools proxy at
`MCP_SERVER_URL`. When multi-factor authentication requires an OTP delivered over email, you can register the
`gmail-otp-mcp` proxy alongside the browser session so the agent can retrieve the verification code without additional setup.

Set the following optional environment variables to customize the configuration:

| Variable | Description |
| --- | --- |
| `MCP_PRIMARY_SERVER_NAME` | Name used for the primary MCP server entry (defaults to `http`). |
| `MCP_PRIMARY_SERVER_ALIASES` | Comma-separated aliases that point to the same primary server URL. |
| `MCP_GMAIL_OTP_URL` | URL for the Gmail OTP MCP proxy. When defined, the server becomes available to every task. |
| `MCP_GMAIL_OTP_SERVER_NAME` | Optional alias for the Gmail OTP server entry (defaults to `gmailOtp`). |
| `MCP_SERVERS_FILE` | Optional path to a JSON file describing MCP servers. Accepts either a top-level `{ "mcpServers": { ... } }` object or a plain mapping of aliases to server definitions. |
| `MCP_ADDITIONAL_SERVERS` | JSON object describing extra MCP servers. Each key is the alias and each value is either a URL string or an object with a `url` key and optional extra configuration. |

Example shell configuration:

```bash
export MCP_SERVER_URL=http://localhost:9000/sse
export MCP_GMAIL_OTP_URL=http://localhost:9100/sse
export MCP_ADDITIONAL_SERVERS='{"fileManager": {"url": "http://localhost:9200/sse", "capabilities": ["fs"]}}'
```

Alternatively, place the server definitions into a JSON file referenced via `MCP_SERVERS_FILE`:

```json
{
  "mcpServers": {
    "chrome:lab1": {"url": "http://localhost:9000/sse"},
    "gmail:otp": {"url": "http://localhost:9100/sse"}
  }
}
```

```bash
export MCP_SERVERS_FILE=./config/mcp-servers.json
```

Environment variables such as `MCP_GMAIL_OTP_URL` and `MCP_ADDITIONAL_SERVERS` continue to override entries from the file so you can reuse the same JSON configuration across environments.

With these values the agent can call the Chrome DevTools MCP, fetch OTPs from Gmail, and reach any other registered proxy
without further changes to task definitions.

