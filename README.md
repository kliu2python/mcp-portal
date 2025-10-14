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

## Backend API Enhancements

- Redis now tracks active, completed, cancelled, and failed tasks along with their console output.
- `/tasks` and related endpoints expose task history, logs, and downloadable text files for long-term storage.
- Console logs are persisted automatically at task completion and remain available via Redis for replay or future storage solutions.

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

