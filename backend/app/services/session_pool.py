from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass(frozen=True)
class SessionDefinition:
    identifier: str
    server_url: str
    xpra_url: str


class SessionPool:
    def __init__(self, sessions: List[SessionDefinition]):
        self._available: List[SessionDefinition] = list(sessions)
        self._in_use: Dict[str, SessionDefinition] = {}
        self._waiters: deque[asyncio.Future[SessionDefinition]] = deque()
        self._lock = asyncio.Lock()

    async def acquire_nowait(self) -> Optional[SessionDefinition]:
        async with self._lock:
            if self._available:
                allocation = self._available.pop()
                self._in_use[allocation.identifier] = allocation
                return allocation
            return None

    async def acquire(self) -> SessionDefinition:
        async with self._lock:
            if self._available:
                allocation = self._available.pop()
                self._in_use[allocation.identifier] = allocation
                return allocation
            loop = asyncio.get_running_loop()
            future: asyncio.Future[SessionDefinition] = loop.create_future()
            self._waiters.append(future)

        allocation = await future
        return allocation

    async def release(self, allocation: SessionDefinition) -> None:
        async with self._lock:
            if self._in_use.pop(allocation.identifier, None) is None:
                return
            while self._waiters:
                waiter = self._waiters.popleft()
                if waiter.done():
                    continue
                waiter.set_result(allocation)
                return
            self._available.append(allocation)


SESSION_POOL = SessionPool(
    [
        SessionDefinition("8882", "http://10.160.13.110:8882/sse", "http://10.160.13.110:10000"),
        SessionDefinition("8883", "http://10.160.13.110:8883/sse", "http://10.160.13.110:10001"),
        SessionDefinition("8884", "http://10.160.13.110:8884/sse", "http://10.160.13.110:10002"),
        SessionDefinition("8885", "http://10.160.13.110:8885/sse", "http://10.160.13.110:10003"),
    ]
)
