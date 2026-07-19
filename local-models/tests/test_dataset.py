import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dataset import score_to_band, threads_from_records, time_split  # noqa: E402


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
