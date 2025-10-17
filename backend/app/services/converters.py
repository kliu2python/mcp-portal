from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from ..models import LLMModel, ModelConfig, PromptTemplate, TestCase, TestRun
from ..schemas import (
    LLMModelRead,
    ModelConfigRead,
    PromptTemplateRead,
    TestCaseRead,
    TestRunLogEntry,
    TestRunRead,
)
from ..utils.json import load_dict, load_json_list, load_string_list


def mask_api_key(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}{'*' * (len(value) - 8)}{value[-4:]}"


def prompt_to_read(template: PromptTemplate) -> PromptTemplateRead:
    return PromptTemplateRead(
        id=template.id,
        name=template.name,
        description=template.description,
        template=template.template,
        is_system=template.is_system,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def model_config_to_read(config: ModelConfig) -> ModelConfigRead:
    return ModelConfigRead(
        id=config.id,
        name=config.name,
        provider=config.provider,
        description=config.description,
        parameters=load_dict(config.parameters),
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


def test_case_to_read(case: TestCase) -> TestCaseRead:
    return TestCaseRead(
        id=case.id,
        reference=case.reference,
        title=case.title,
        description=case.description,
        category=case.category,
        priority=case.priority,
        status=case.status,
        tags=load_string_list(case.tags),
        steps=load_string_list(case.steps),
        created_at=case.created_at,
        updated_at=case.updated_at,
    )


def llm_model_to_read(model: LLMModel) -> LLMModelRead:
    return LLMModelRead(
        id=model.id,
        name=model.name,
        base_url=model.base_url,
        model_name=model.model_name,
        description=model.description,
        is_system=model.is_system,
        masked_api_key=mask_api_key(model.api_key),
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def test_run_to_read(run: TestRun) -> TestRunRead:
    logs_raw = load_json_list(run.log)
    log_entries: List[TestRunLogEntry] = []
    for entry in logs_raw:
        if isinstance(entry, dict):
            timestamp = entry.get("timestamp")
            try:
                parsed_timestamp = (
                    datetime.fromisoformat(timestamp) if timestamp else datetime.utcnow()
                )
            except ValueError:
                parsed_timestamp = datetime.utcnow()
            log_entries.append(
                TestRunLogEntry(
                    timestamp=parsed_timestamp,
                    type=str(entry.get("type", "info")),
                    message=str(entry.get("message", "")),
                )
            )
    metrics = load_dict(run.metrics)
    return TestRunRead(
        id=run.id,
        test_case_id=run.test_case_id,
        model_config_id=run.model_config_id,
        status=run.status,
        result=run.result,
        prompt=run.prompt,
        server_url=run.server_url,
        xpra_url=run.xpra_url,
        task_id=run.task_id,
        log=log_entries,
        metrics=metrics,
        created_at=run.created_at,
        updated_at=run.updated_at,
        started_at=run.started_at,
        completed_at=run.completed_at,
    )
