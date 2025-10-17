from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List, Mapping, Sequence


def dump_list(values: Sequence[str]) -> str:
    return json.dumps(list(values), ensure_ascii=False)


def dump_dict(values: Mapping[str, Any]) -> str:
    return json.dumps(dict(values), ensure_ascii=False)


def load_json_list(raw: str) -> List[Any]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return data
    return []


def load_dict(raw: str) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if isinstance(data, dict):
        return data
    return {}


def load_string_list(raw: str) -> List[str]:
    values = load_json_list(raw)
    return [str(value) for value in values]
