from __future__ import annotations

from typing import Optional

DEFAULT_PROMPT_TEMPLATE = (
    "You are an expert QA automation agent. Carefully execute the requested task and "
    "return clear, concise results. Task instructions:\n{task}"
)


def render_task_prompt(task_text: str, prompt_template: Optional[str]) -> str:
    template = prompt_template or DEFAULT_PROMPT_TEMPLATE
    try:
        if "{task}" in template:
            return template.format(task=task_text)
    except (KeyError, ValueError):  # defensive formatting
        pass
    cleaned_template = template.strip()
    return (
        f"{cleaned_template}\n\nTask Instructions:\n{task_text}"
        if cleaned_template
        else task_text
    )
