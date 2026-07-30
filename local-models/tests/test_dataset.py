import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import TrainConfig  # noqa: E402
from dataset import (  # noqa: E402
    apply_recency_decay,
    recency_decay_factor,
    score_to_band,
    threads_from_records,
    time_split,
)


def _rec(**kw):
    base = {
        "threadId": "t1",
        "subject": "Hello",
        "body": "World",
        "senderDomain": ".*@example\\.com$",
        "senderHash": "abc",
        "isReceived": True,
        "isRead": False,
        "hasAttachments": False,
        "receivedAt": "2026-06-01T10:00:00.000Z",
        "category": "Work",
        "categoryIsUserCorrected": False,
        "priorityScore": 20,
    }
    base.update(kw)
    return base


def test_collapses_emails_to_threads_keeping_latest():
    records = [
        _rec(threadId="t1", subject="first", receivedAt="2026-06-01T10:00:00.000Z"),
        _rec(threadId="t1", subject="latest", receivedAt="2026-06-02T10:00:00.000Z"),
        _rec(threadId="t2", subject="other"),
    ]
    threads = threads_from_records(records)
    by_id = {t.thread_id: t for t in threads}
    assert len(threads) == 2
    # latest email's subject is kept, and thread_length counts both emails
    assert by_id["t1"].subject == "latest"
    assert by_id["t1"].thread_length == 2
    assert by_id["t2"].thread_length == 1


def test_null_category_becomes_other():
    threads = threads_from_records([_rec(category=None)])
    assert threads[0].category == "Other"


def test_records_with_null_thread_id_are_skipped():
    threads = threads_from_records([_rec(threadId=None)])
    assert threads == []


def test_score_to_band_edges():
    # edges are (10, 35): low < 10 <= med < 35 <= high
    assert score_to_band(0) == "low"
    assert score_to_band(9.9) == "low"
    assert score_to_band(10) == "med"
    assert score_to_band(34) == "med"
    assert score_to_band(35) == "high"
    assert score_to_band(80) == "high"
    assert score_to_band(None) is None


def test_recency_decay_factor_recent_vs_old():
    now = "2026-06-30T00:00:00.000Z"
    # brand-new (== reference now) gets full weight
    assert recency_decay_factor(now, now, half_life_days=45.0, min_weight=0.1) == 1.0
    # exactly one half-life old ≈ 0.5
    one_hl = "2026-05-16T00:00:00.000Z"  # 45 days before now
    assert abs(recency_decay_factor(one_hl, now, 45.0, 0.1) - 0.5) < 0.01
    # a more recent thread weighs strictly more than an older one
    recent = "2026-06-20T00:00:00.000Z"
    old = "2026-01-01T00:00:00.000Z"
    assert recency_decay_factor(recent, now, 45.0, 0.1) > recency_decay_factor(old, now, 45.0, 0.1)


def test_recency_decay_factor_floor_holds_and_never_zero():
    now = "2026-06-30T00:00:00.000Z"
    ancient = "2000-01-01T00:00:00.000Z"  # many half-lives old
    factor = recency_decay_factor(ancient, now, half_life_days=45.0, min_weight=0.1)
    assert factor == 0.1  # clamped to the floor, never 0


def test_recency_decay_factor_unparseable_or_future_is_full_weight():
    now = "2026-06-30T00:00:00.000Z"
    assert recency_decay_factor("", now, 45.0, 0.1) == 1.0
    assert recency_decay_factor("not-a-date", now, 45.0, 0.1) == 1.0
    # future-dated (after the reference) is never penalised
    future = "2026-12-31T00:00:00.000Z"
    assert recency_decay_factor(future, now, 45.0, 0.1) == 1.0


def test_sample_weight_composes_recency_with_correction_multiplier():
    # A recent user-corrected label is the strongest signal (3.0 x ~1.0);
    # a stale correction still stacks its 3x on top of the decayed base.
    records = [
        _rec(threadId="new_plain", receivedAt="2026-06-30T00:00:00.000Z",
             categoryIsUserCorrected=False),
        _rec(threadId="new_corrected", receivedAt="2026-06-30T00:00:00.000Z",
             categoryIsUserCorrected=True),
        _rec(threadId="old_plain", receivedAt="2026-01-01T00:00:00.000Z",
             categoryIsUserCorrected=False),
        _rec(threadId="old_corrected", receivedAt="2026-01-01T00:00:00.000Z",
             categoryIsUserCorrected=True),
    ]
    threads = threads_from_records(records)
    config = TrainConfig(recency_half_life_days=45.0, recency_min_weight=0.1)
    apply_recency_decay(threads, config)
    by_id = {t.thread_id: t for t in threads}

    # newest thread is the reference -> decay 1.0
    assert by_id["new_plain"].sample_weight == 1.0
    assert by_id["new_corrected"].sample_weight == 3.0  # correction stacks on top
    # old plain decays below 1.0; old correction is exactly 3x that decayed base
    old_plain = by_id["old_plain"].sample_weight
    assert 0.1 <= old_plain < 1.0
    assert abs(by_id["old_corrected"].sample_weight - old_plain * 3.0) < 1e-9
    # a recent correction outweighs a stale correction (recency is real)
    assert by_id["new_corrected"].sample_weight > by_id["old_corrected"].sample_weight


def test_apply_recency_decay_disabled_is_flat():
    records = [
        _rec(threadId="new", receivedAt="2026-06-30T00:00:00.000Z"),
        _rec(threadId="old", receivedAt="2026-01-01T00:00:00.000Z"),
    ]
    threads = threads_from_records(records)
    apply_recency_decay(threads, TrainConfig(recency_decay_enabled=False))
    # disabled -> every thread keeps recency 1.0 and sample_weight == base weight
    for t in threads:
        assert t.recency_decay == 1.0
        assert t.sample_weight == t.weight


def test_time_split_is_chronological_and_disjoint():
    records = [
        _rec(threadId=f"t{i}", receivedAt=f"2026-06-{i+1:02d}T10:00:00.000Z")
        for i in range(10)
    ]
    threads = threads_from_records(records)
    train, test = time_split(threads, 0.8)
    assert len(train) == 8 and len(test) == 2
    # every train thread is older than every test thread
    assert max(t.received_at for t in train) <= min(t.received_at for t in test)
    # disjoint
    assert set(t.thread_id for t in train).isdisjoint(t.thread_id for t in test)
