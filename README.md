# Web Automation Quality Portal

Web Automation Quality Portal is a full-stack test automation control center that combines a FastAPI backend with a modern React dashboard. It enables QA teams to describe tests in natural language, manage reusable scripted cases, and monitor executions with detailed reporting, screenshots, and analytics.

## Key Capabilities

### Intelligent Test Execution
- Launch single test cases, batch suites, or natural-language prompts that are translated into actionable automation steps.
- Monitor progress in real time with server-sent events, live status updates, and per-step screenshots.
- Capture execution metadata including duration, pass/fail counts, requester, and linked test cases.

### Test Case Management
- Create, edit, and delete structured test cases with step-by-step definitions.
- Organise cases with categories, tags, owners, lifecycle status, and priority.
- Apply bulk updates for status, priority, and tagging across multiple cases at once.

### Reporting & Analytics
- Rich dashboards summarising test coverage, execution throughput, pass rates, and active runs.
- Trend analysis for daily execution counts, success/failure ratios, and duration averages.
- Category and priority breakdown visualisations for quick risk assessment.

### Data Persistence
- SQLModel-powered relational storage backed by SQLite by default (MySQL support via `DATABASE_URL`).
- Automation artefacts such as generated screenshots are stored beneath the `reports/` directory and exposed via static routes.

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- Optional: Docker & Docker Compose for containerised deployment

### Local Development

Start the backend API:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

By default the backend uses SQLite at `automation.db`. Override the database by setting `DATABASE_URL`, for example `mysql+pymysql://user:password@host:3306/automation`.

Start the React frontend (in a separate terminal):

```bash
npm install
npm start
```

Set `REACT_APP_API_BASE_URL` in your environment if the backend is hosted on a different origin (default: `http://localhost:8000`).

### Docker Compose

A production-style stack is available via Docker Compose:

```bash
docker-compose up --build
```

This launches:
- **backend** – FastAPI service exposing the automation APIs on `http://localhost:8000`.
- **frontend** – Optimised React build served by Nginx on `http://localhost:3000`.

Backend volumes persist the SQLite database (`/app/data`) and generated reports (`/app/reports`). Configure MySQL by setting `DATABASE_URL` before running Compose.

## API Overview

- `GET /test-cases` – List cases with filtering support.
- `POST /test-cases` – Create a structured test case.
- `POST /test-cases/bulk-update` – Apply bulk lifecycle changes.
- `POST /executions` – Start a single execution from a case or prompt.
- `POST /executions/batch` – Trigger multiple cases simultaneously.
- `GET /executions/{id}/stream` – Server-sent events feed for live monitoring.
- `GET /metrics/summary` – Overall metrics for dashboards.

See `backend/main.py` for the full schema and endpoint definitions.

## Testing & Quality

- The React dashboard uses Recharts for analytics, Tailwind utility classes, and Lucide icons for a consistent design system.
- FastAPI streams live execution updates to the UI and generates placeholder screenshots for each step using Pillow.
- SQLModel ensures database portability between SQLite (default) and MySQL.

## Project Structure

```
backend/            FastAPI application, SQLModel models, execution engine
backend/reports/    Generated execution artefacts and screenshots
frontend (src/)     React components, dashboard UI, and automation workflows
public/             Static assets for the frontend
```

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `DATABASE_URL` | SQLAlchemy connection string | `sqlite:///./automation.db` |
| `REPORT_ROOT` | Directory for generated reports | `reports` |
| `STEP_DELAY_SECONDS` | Delay between simulated steps | `0.6` |
| `DEFAULT_EXECUTOR` | Fallback requester name | `automation-bot` |
| `REACT_APP_API_BASE_URL` | Frontend build-time API base URL | `http://localhost:8000` |

## Roadmap Ideas

- Plug actual browser automation engines (e.g., Playwright or Selenium) into the execution pipeline.
- Integrate authentication and role-based access controls for large organisations.
- Extend analytics with flaky test detection, build pipeline correlations, and release readiness gates.

