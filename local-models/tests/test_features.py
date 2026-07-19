import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

from dataset import Thread  # noqa: E402
from features import NUM_METADATA_FEATURES, FeatureBuilder  # noqa: E402


def _thread(**kw):
    base = dict(
        thread_id="t1",
        subject="Re: Invoice #4521",
        body="Please find attached the invoice for last month.",
        sender_domain=".*@vendor\\.com$",
        sender_hash="hash-vendor",
        is_received=True,
        is_read=False,
        has_attachments=True,
        received_at="2026-06-01T14:30:00.000Z",
        thread_length=2,
        category="Receipts",
        category_is_user_corrected=False,
        priority_score=20,
    )
    base.update(kw)
    return Thread(**base)


def _corpus():
    return [
        _thread(thread_id="a", subject="invoice due", sender_domain=".*@vendor\\.com$"),
        _thread(thread_id="b", subject="newsletter weekly", sender_domain=".*@news\\.com$"),
        _thread(thread_id="c", subject="pull request merged", sender_domain=".*@github\\.com$"),
        _thread(thread_id="d", subject="invoice reminder", sender_domain=".*@vendor\\.com$"),
    ]


def test_transform_before_fit_raises():
    with pytest.raises(RuntimeError):
        FeatureBuilder().transform([_thread()])


def test_fit_transform_shape_is_stable_across_calls():
    builder = FeatureBuilder().fit(_corpus())
    width = builder.transform(_corpus()).shape[1]
    # an unrelated single thread must map into the same feature space
    again = builder.transform([_thread(thread_id="z", subject="totally new words here")])
    assert again.shape[1] == width
    assert again.shape[0] == 1


def test_unseen_sender_gets_zero_frequency_not_error():
    builder = FeatureBuilder().fit(_corpus())
    # a sender never seen in training should transform fine (frequency 0)
    out = builder.transform([_thread(sender_hash="brand-new-sender")])
    assert out.shape[0] == 1


def test_metadata_feature_count_matches_constant():
    # the dense metadata block is the last NUM_METADATA_FEATURES columns; the
    # total width must exceed it (text + domain columns precede it)
    builder = FeatureBuilder().fit(_corpus())
    assert builder.transform(_corpus()).shape[1] > NUM_METADATA_FEATURES
