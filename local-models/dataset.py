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

import datetime
import json
from collections import Counter
from dataclasses import dataclass
from typing import Any, Iterable

from config import OTHER_CATEGORY, PRIORITY_BAND_EDGES, PRIORITY_BANDS, TrainConfig


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

    # Base training weight — user-corrected labels are a stronger signal, so the
    # export marks them heavier (3.0) and the category heads fit with these
    # weights. This is the correction multiplier; recency decay (below) is a
    # separate factor so the two compose cleanly.
    weight: float = 1.0

    # Recency multiplier in [recency_min_weight, 1.0], set by apply_recency_decay
    # from the thread's age relative to the export's newest thread. Defaults to
    # 1.0 (no decay) so a Thread built without decay behaves exactly as before.
    recency_decay: float = 1.0

    @property
    def sample_weight(self) -> float:
        """Final training weight fed to the category heads: the correction
        multiplier scaled by the recency decay. Keeping the composition here (one
        place) makes it explicit that a recent correction is the strongest signal
        (3.0 x ~1.0) while a stale correction still outweighs a stale plain label
        (both decayed, but the correction keeps its 3x)."""
        return self.weight * self.recency_decay

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


def _parse_iso(ts: str) -> datetime.datetime | None:
    """Parse an ISO-8601 timestamp (export uses a trailing `Z`). Returns None for
    empty/unparseable values so callers can fall back gracefully."""
    if not ts:
        return None
    try:
        return datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


def recency_decay_factor(
    received_at: str,
    reference_now: str,
    half_life_days: float,
    min_weight: float,
) -> float:
    """Exponential time-decay multiplier for a thread's training weight.

    A thread received at `reference_now` (the export's newest thread) weighs 1.0;
    one half-life older weighs 0.5; the value decays toward `min_weight` (never 0,
    so ancient rare-category examples still contribute a little). `reference_now`
    is the export max — not wall-clock — so the run is deterministic and
    reproducible, matching the time-based split. Unparseable or future-dated
    threads get the full 1.0 (we never *penalise* a thread we can't place).
    """
    ref = _parse_iso(reference_now)
    ts = _parse_iso(received_at)
    if ref is None or ts is None:
        return 1.0
    age_days = (ref - ts).total_seconds() / 86400.0
    if age_days <= 0:
        return 1.0
    factor = 0.5 ** (age_days / half_life_days)
    return max(min_weight, min(1.0, factor))


def apply_recency_decay(threads: list[Thread], config: TrainConfig) -> list[Thread]:
    """Set each thread's `recency_decay` from its age relative to the newest
    thread in `threads` (the export's max received_at as "now"). No-op that
    resets to 1.0 when disabled, so the flag gives a clean A/B against flat
    weighting. Mutates and returns the same list."""
    if not config.recency_decay_enabled:
        for t in threads:
            t.recency_decay = 1.0
        return threads
    reference_now = max((t.received_at for t in threads if t.received_at), default="")
    for t in threads:
        t.recency_decay = recency_decay_factor(
            t.received_at,
            reference_now,
            config.recency_half_life_days,
            config.recency_min_weight,
        )
    return threads


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
