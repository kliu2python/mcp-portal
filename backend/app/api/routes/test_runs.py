from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...models import ModelConfig, TestCase, TestRun
from ...schemas import QualityInsightsResponse, TestRunRead, TestRunRequest
from ...services.converters import test_run_to_read
from ...services.llm import get_prompt_template
from ...services.test_runs import (
    append_run_log_entry,
    build_prompt_for_case,
    compute_quality_insights,
    run_queue,
)
from ...utils.json import dump_dict

router = APIRouter()


@router.post("/test-runs", response_model=List[TestRunRead], status_code=status.HTTP_201_CREATED)
async def queue_test_runs(
    payload: TestRunRequest, session: AsyncSession = Depends(get_db)
):
    if payload.model_config_id is None and payload.model_config_payload is None:
        raise HTTPException(status_code=400, detail="Provide model_config_id or model_config payload.")

    model_config_id = payload.model_config_id
    created_config: Optional[ModelConfig] = None
    if payload.model_config_payload is not None:
        created_config = ModelConfig(
            name=payload.model_config_payload.name,
            provider=payload.model_config_payload.provider,
            description=payload.model_config_payload.description,
            parameters=dump_dict(payload.model_config_payload.parameters),
        )
        session.add(created_config)
        await session.commit()
        await session.refresh(created_config)
        model_config_id = created_config.id

    if model_config_id is None:
        raise HTTPException(status_code=400, detail="Unable to resolve model configuration.")

    result = await session.execute(
        select(TestCase).where(TestCase.id.in_(payload.test_case_ids))
    )
    test_cases = {case.id: case for case in result.scalars().all()}
    missing = [case_id for case_id in payload.test_case_ids if case_id not in test_cases]
    if missing:
        raise HTTPException(
            status_code=404, detail=f"Test case(s) not found: {', '.join(map(str, missing))}"
        )

    prompt_override = payload.prompt
    if payload.prompt_id is not None:
        prompt_template = await get_prompt_template(session, payload.prompt_id)
        prompt_override = prompt_template.template

    created_runs: List[TestRun] = []
    for case_id in payload.test_case_ids:
        test_case = test_cases[case_id]
        prompt = build_prompt_for_case(test_case, prompt_override)
        run = TestRun(
            test_case_id=test_case.id,
            model_config_id=model_config_id,
            status="queued",
            prompt=prompt,
            server_url=None,
            xpra_url=None,
        )
        session.add(run)
        created_runs.append(run)

    await session.commit()

    for run in created_runs:
        await session.refresh(run)
        await append_run_log_entry(session, run, "Queued for execution", "info")
        await run_queue.put(run.id)

    return [test_run_to_read(run) for run in created_runs]


@router.get("/test-runs", response_model=List[TestRunRead])
async def list_test_runs(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(TestRun).order_by(TestRun.created_at.desc()))
    runs = result.scalars().all()
    return [test_run_to_read(run) for run in runs]


@router.get("/test-runs/{run_id}", response_model=TestRunRead)
async def get_test_run(run_id: int, session: AsyncSession = Depends(get_db)):
    run = await session.get(TestRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Test run not found.")
    return test_run_to_read(run)


@router.get("/quality-insights", response_model=QualityInsightsResponse)
async def get_quality_insights(session: AsyncSession = Depends(get_db)):
    cases_result = await session.execute(select(TestCase))
    cases = cases_result.scalars().all()
    runs_result = await session.execute(select(TestRun))
    runs = runs_result.scalars().all()
    return compute_quality_insights(cases, runs)
