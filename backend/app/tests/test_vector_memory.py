from ..models.knowledge_entry import KnowledgeBaseEntry
from ..services.vector_memory import (
    MemoryMatch,
    VectorMemory,
    append_memory_to_text,
)
from ..utils.json import dump_list


def make_entry(title: str, content: str, *tags: str) -> KnowledgeBaseEntry:
    return KnowledgeBaseEntry(title=title, content=content, tags=dump_list(tags))


def test_vector_memory_prioritises_relevant_entry() -> None:
    index = VectorMemory()
    fortigate = make_entry(
        "FortiGate Login",
        "Navigate to the FortiGate web UI and authenticate with administrator credentials.",
        "fortigate",
        "login",
    )
    unrelated = make_entry("Reset MFA token", "Follow corporate MFA reset policy.", "mfa")

    index.build([fortigate, unrelated])
    matches = index.search("How do I log in to FortiGate?", top_k=2)

    assert matches, "Expected relevant matches to be returned"
    assert matches[0].entry.title == "FortiGate Login"


def test_append_memory_to_text_formats_reference_section() -> None:
    base_text = "Execute the firewall login regression flow."
    entry = make_entry(
        "FortiToken Cloud Login",
        "Browse to FortiToken Cloud, enter tenant ID, username, and password, then approve the MFA push.",
        "fortitoken",
        "login",
    )
    result = append_memory_to_text(base_text, [MemoryMatch(entry=entry, score=0.42)])

    assert "Helpful Reference Material" in result
    assert "FortiToken Cloud Login" in result
    assert "Tags: fortitoken, login" in result
