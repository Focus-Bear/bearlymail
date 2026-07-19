import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dataset import Thread  # noqa: E402
from relabel import (  # noqa: E402
    OTHER_INDEX,
    load_labels,
    numbered_taxonomy,
    score,
)


def _thread(tid, category):
    return Thread(
        thread_id=tid,
        subject="s",
        body="b",
        sender_domain="d",
        sender_hash=None,
        is_received=True,
        is_read=False,
        has_attachments=False,
        received_at="2026-06-01T00:00:00Z",
        thread_length=1,
        category=category,
        category_is_user_corrected=False,
        priority_score=10,
    )


def test_numbered_taxonomy_reserves_zero_for_other():
    text = numbered_taxonomy(["Work - work mail", "Newsletters"])
    lines = text.splitlines()
    assert lines[0].startswith(f"{OTHER_INDEX}. ")
    assert lines[1] == "1. Work - work mail"
    assert lines[2] == "2. Newsletters"


def test_load_labels_maps_indices_back_to_categories(tmp_path):
    (tmp_path / "taxonomy.txt").write_text(
        numbered_taxonomy(["Work - work mail", "Newsletters"]), encoding="utf-8"
    )
    (tmp_path / "labels_000.json").write_text(
        json.dumps({"t1": 1, "t2": 0, "t3": 2}), encoding="utf-8"
    )
    labels = load_labels(str(tmp_path))
    assert labels == {"t1": "Work - work mail", "t2": "Other", "t3": "Newsletters"}


def test_score_reports_agreement_and_other_counts():
    threads = [
        _thread("t1", "Work - work mail"),
        _thread("t2", "Other"),
        _thread("t3", "Newsletters"),
    ]
    # relabel agrees on t1, recovers t2 from Other, changes t3
    relabeled = {"t1": "Work - work mail", "t2": "Newsletters", "t3": "Work - work mail"}
    s = score(relabeled, threads)
    assert s["compared"] == 3
    assert s["changed"] == 2
    assert s["cheap_other"] == 1  # t2 was Other in the cheap labels
    assert s["strong_other"] == 0  # relabel left nothing as Other
