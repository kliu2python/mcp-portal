from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from ..db.base import Base


class TestRun(Base):
    __tablename__ = "test_runs"

    id = Column(Integer, primary_key=True, index=True)
    test_case_id = Column(Integer, ForeignKey("test_cases.id"), nullable=False)
    model_config_id = Column(Integer, ForeignKey("model_configs.id"), nullable=True)
    status = Column(String(50), nullable=False, default="queued")
    result = Column(String(50), nullable=True)
    prompt = Column(Text, nullable=False)
    server_url = Column(String(255), nullable=True)
    xpra_url = Column(String(255), nullable=True)
    task_id = Column(String(64), nullable=True)
    log = Column(Text, nullable=False, default="[]")
    metrics = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
