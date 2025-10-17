from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import KnowledgeBaseEntry
from ..utils.json import load_string_list


def _build_search_document(entry: KnowledgeBaseEntry) -> str:
    tags = " ".join(load_string_list(entry.tags))
    return "\n".join(filter(None, [entry.title, entry.content, tags]))


TOKEN_PATTERN = re.compile(r"[A-Za-z0-9]+")


@dataclass
class MemoryMatch:
    entry: KnowledgeBaseEntry
    score: float


class VectorMemory:
    """Lightweight TF-IDF style vector search over knowledge entries."""

    def __init__(self) -> None:
        self._entries: List[KnowledgeBaseEntry] = []
        self._term_counts: List[Counter[str]] = []
        self._document_frequency: Counter[str] = Counter()
        self._vectors: List[Dict[str, float]] = []
        self._norms: List[float] = []

    def build(self, entries: Sequence[KnowledgeBaseEntry]) -> None:
        self._entries = list(entries)
        self._term_counts = []
        self._document_frequency = Counter()
        self._vectors = []
        self._norms = []

        documents = [_build_search_document(entry) for entry in self._entries]
        for document in documents:
            counter = Counter(self._tokenize(document))
            self._term_counts.append(counter)
            for token in counter:
                self._document_frequency[token] += 1

        total_documents = len(self._entries)
        if total_documents == 0:
            return

        for counter in self._term_counts:
            weights: Dict[str, float] = {}
            for token, count in counter.items():
                idf = self._idf(token, total_documents)
                weights[token] = count * idf
            norm = math.sqrt(sum(value * value for value in weights.values()))
            self._vectors.append(weights)
            self._norms.append(norm)

    def search(self, query: str, top_k: int = 3) -> List[MemoryMatch]:
        if not query.strip() or not self._entries:
            return []

        total_documents = len(self._entries)
        query_counter = Counter(self._tokenize(query))
        if not query_counter:
            return []

        query_weights: Dict[str, float] = {}
        for token, count in query_counter.items():
            idf = self._idf(token, total_documents)
            if idf <= 0:
                continue
            query_weights[token] = count * idf

        query_norm = math.sqrt(sum(value * value for value in query_weights.values()))
        if query_norm == 0:
            return []

        matches: List[MemoryMatch] = []
        for entry, weights, norm in zip(self._entries, self._vectors, self._norms):
            if norm == 0:
                continue
            dot_product = sum(weights.get(token, 0.0) * value for token, value in query_weights.items())
            if dot_product <= 0:
                continue
            score = dot_product / (norm * query_norm)
            if score > 0:
                matches.append(MemoryMatch(entry=entry, score=score))

        matches.sort(key=lambda item: item.score, reverse=True)
        return matches[:top_k]

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        return [token.lower() for token in TOKEN_PATTERN.findall(text)]

    def _idf(self, token: str, total_documents: int) -> float:
        df = self._document_frequency.get(token, 0)
        return math.log((1 + total_documents) / (1 + df)) + 1.0


async def fetch_relevant_memory(
    session: AsyncSession,
    query_text: str,
    *,
    tags: Optional[Iterable[str]] = None,
    limit: int = 3,
) -> List[MemoryMatch]:
    if not query_text.strip():
        return []

    result = await session.execute(select(KnowledgeBaseEntry))
    entries = list(result.scalars().all())
    if not entries:
        return []

    tag_set = {tag.lower() for tag in tags or [] if tag}
    if tag_set:
        tagged_entries = [
            entry
            for entry in entries
            if tag_set.intersection({tag.lower() for tag in load_string_list(entry.tags)})
        ]
        if tagged_entries:
            entries = tagged_entries

    memory = VectorMemory()
    memory.build(entries)
    return memory.search(query_text, top_k=limit)


def append_memory_to_text(
    base_text: str, matches: Sequence[MemoryMatch], *, heading: str = "Helpful Reference Material"
) -> str:
    if not matches:
        return base_text

    sections: List[str] = []
    for match in matches:
        tags = load_string_list(match.entry.tags)
        lines = [match.entry.title.strip(), match.entry.content.strip()]
        if tags:
            lines.append(f"Tags: {', '.join(tags)}")
        sections.append("\n".join(filter(None, lines)))

    memory_block = "\n\n".join(section for section in sections if section)
    if not memory_block:
        return base_text

    formatted_base = base_text.rstrip()
    if formatted_base:
        formatted_base += "\n\n"
    return f"{formatted_base}{heading}:\n{memory_block}"

