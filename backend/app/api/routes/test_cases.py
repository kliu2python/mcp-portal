from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.session import get_db
from ...models import TestCase
from ...schemas import TestCaseCreate, TestCaseRead, TestCaseUpdate
from ...services.converters import test_case_to_read
from ...utils.json import dump_list

router = APIRouter()


@router.get("/test-cases", response_model=List[TestCaseRead])
async def list_test_cases(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(TestCase).order_by(TestCase.created_at.desc()))
    cases = result.scalars().all()
    return [test_case_to_read(case) for case in cases]


@router.post("/test-cases", response_model=TestCaseRead, status_code=status.HTTP_201_CREATED)
async def create_test_case(
    payload: TestCaseCreate, session: AsyncSession = Depends(get_db)
):
    test_case = TestCase(
        reference=payload.reference,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        priority=payload.priority,
        status=payload.status,
        tags=dump_list(payload.tags),
        steps=dump_list(payload.steps),
    )
    session.add(test_case)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=400, detail="Test case reference must be unique.") from exc

    await session.refresh(test_case)
    return test_case_to_read(test_case)


@router.put("/test-cases/{test_case_id}", response_model=TestCaseRead)
async def update_test_case(
    test_case_id: int, payload: TestCaseUpdate, session: AsyncSession = Depends(get_db)
):
    test_case = await session.get(TestCase, test_case_id)
    if test_case is None:
        raise HTTPException(status_code=404, detail="Test case not found.")

    if payload.reference is not None:
        test_case.reference = payload.reference
    if payload.title is not None:
        test_case.title = payload.title
    if payload.description is not None:
        test_case.description = payload.description
    if payload.category is not None:
        test_case.category = payload.category
    if payload.priority is not None:
        test_case.priority = payload.priority
    if payload.status is not None:
        test_case.status = payload.status
    if payload.tags is not None:
        test_case.tags = dump_list(payload.tags)
    if payload.steps is not None:
        test_case.steps = dump_list(payload.steps)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=400, detail="Test case reference must be unique.") from exc

    await session.refresh(test_case)
    return test_case_to_read(test_case)


@router.delete("/test-cases/{test_case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test_case(test_case_id: int, session: AsyncSession = Depends(get_db)):
    test_case = await session.get(TestCase, test_case_id)
    if test_case is None:
        raise HTTPException(status_code=404, detail="Test case not found.")

    await session.delete(test_case)
    await session.commit()
