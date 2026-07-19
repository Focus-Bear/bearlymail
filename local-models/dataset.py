"""
Load a BearlyMail email export into thread-level training examples.

The export (`emails.json` inside the password-protected zip from
`POST /emails/export`) is one record per *email*. The product stores category
and priority on the *thread*, and the brief is explicit that the prediction
unit is the thread, not the message (brief §4: one thread = one example). So we
collapse emails to threads here, once, and everything downstream works on
threads.
"""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass
from typing import Any, Iterable

from config import OTHER_CATEGORY, PRIORITY_BAND_EDGES, PRIORITY_BANDS


@dataclass
class Thread:
    """One thread = one training example. Fields mirror the export record plus
    the derived label/feature helpers the model needs."""

    thread_id: str
    subject: str
    body: str
    sender_domain: str
    sender_hash: str | None
    is_received: bool
    is_read: bool
    has_attachments: bool
    received_at: str  # ISO 8601; used for the time-based split and time features
    thread_length: int  # number of emails in the thread

    # Labels (what the local model learns to approximate).
    category: str  # OTHER_CATEGORY when the LLM left it uncategorised
    category_is_user_corrected: bool
    priority_score: float | None

    # Training sample weight — user-corrected labels are a stronger signal, so
    # the export marks them heavier and the category heads fit with these weights.
    weight: float = 1.0

    @property
    def priority_band(self) -> str | None:
        return score_to_band(self.priority_score)


def score_to_band(score: Any) -> str | None:
    """Map a numeric priority score to a low/med/high band (config edges).
    Coerces defensively: a missing or non-numeric score yields no band (the
    thread then keeps falling back to the LLM for priority)."""
    if score is None:
        return None
    try:
        score_num = float(score)
    except (ValueError, TypeError):
        return None
    low_edge, high_edge = PRIORITY_BAND_EDGES
    if score_num < low_edge:
        return PRIORITY_BANDS[0]
    if score_num < high_edge:
        return PRIORITY_BANDS[1]
    return PRIORITY_BANDS[2]


def _record_category(record: dict[str, Any]) -> str:
    cat = record.get("category")
    return cat if cat else OTHER_CATEGORY


def _record_weight(record: dict[str, Any]) -> float:
    """Sample weight for the record. Prefers the export's explicit `weight`;
    falls back to deriving one from the user-corrected flag so older exports
    (before the weight field) still up-weight corrections."""
    raw = record.get("weight")
    if isinstance(raw, (int, float)) and not isinstance(raw, bool) and raw > 0:
        return float(raw)
    return 3.0 if record.get("categoryIsUserCorrected") else 1.0


def threads_from_records(records: Iterable[dict[str, Any]]) -> list[Thread]:
    """
    Collapse per-email export records into per-thread examples.

    For each thread we keep the most recent email (its subject/body/sender are
    what the user sees at the top of the conversation) and count how many emails
    the thread holds (a cheap, useful "is this an ongoing back-and-forth"
    signal, brief §6). Category and priority are thread-level in the product, so
    they're identical across a thread's emails — we take them from the kept
    email.
    """
    records = list(records)
    thread_length = Counter(r["threadId"] for r in records if r.get("threadId"))

    latest: dict[str, dict[str, Any]] = {}
    for r in records:
        tid = r.get("threadId")
        if not tid:
            continue
        prev = latest.get(tid)
        if prev is None or (r.get("receivedAt") or "") > (prev.get("receivedAt") or ""):
            latest[tid] = r

    threads: list[Thread] = []
    for tid, r in latest.items():
        threads.append(
            Thread(
                thread_id=tid,
                subject=r.get("subject") or "",
                body=r.get("body") or "",
                sender_domain=r.get("senderDomain") or "",
                sender_hash=r.get("senderHash"),
                is_received=bool(r.get("isReceived")),
                is_read=bool(r.get("isRead")),
                has_attachments=bool(r.get("hasAttachments")),
                received_at=r.get("receivedAt") or "",
                thread_length=thread_length.get(tid, 1),
                category=_record_category(r),
                category_is_user_corrected=bool(r.get("categoryIsUserCorrected")),
                priority_score=r.get("priorityScore"),
                weight=_record_weight(r),
            )
        )
    return threads


def load_threads(export_path: str) -> list[Thread]:
    """Load `emails.json` (the decrypted export) into thread examples."""
    with open(export_path, encoding="utf-8") as f:
        records = json.load(f)
    return threads_from_records(records)


def time_split(threads: list[Thread], train_fraction: float) -> tuple[list[Thread], list[Thread]]:
    """
    Split threads into (train, test) by time — oldest threads train, most
    recent threads test. Never a random split: a random split would let the
    model peek at threads from the same week it's evaluated on and overstate
    real-world accuracy (brief §9). Because we split whole threads, no thread
    can land in both sides.
    """
    ordered = sorted(threads, key=lambda t: t.received_at)
    cut = int(len(ordered) * train_fraction)
    return ordered[:cut], ordered[cut:]
