# syntax=docker/dockerfile:1.6
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN set -eux; \
    # Many recent Debian images ship a .sources file; replace it with https entries
    rm -f /etc/apt/sources.list.d/debian.sources || true; \
    printf '%s\n' \
      'deb https://deb.debian.org/debian trixie main' \
      'deb https://deb.debian.org/debian trixie-updates main' \
      'deb https://security.debian.org/debian-security trixie-security main' \
      > /etc/apt/sources.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      build-essential \
      libjpeg62-turbo-dev \
      zlib1g-dev \
      libfreetype6-dev; \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

COPY . /app

ENV REPORT_ROOT=/app/reports \
    DATABASE_URL=sqlite:////app/data/automation.db \
    DEFAULT_EXECUTOR=automation-bot \
    STEP_DELAY_SECONDS=0.6 \
    PORT=8000

RUN mkdir -p ${REPORT_ROOT} /app/data

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
