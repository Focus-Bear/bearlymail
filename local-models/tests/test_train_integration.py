"""
End-to-end training smoke test on synthetic data — no real export needed.

Builds a small, learnable synthetic dataset (two sender domains that map
cleanly to two categories and two priority bands) and asserts the pipeline
trains, evaluates, and that a confident, in-distribution thread is classified
correctly without falling back.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import TrainConfig  # noqa: E402
from dataset import threads_from_records  # noqa: E402
from features import FeatureBuilder  # noqa: E402
from model import ModelBundle, predict_thread  # noqa: E402
from train import (  # noqa: E402
    _fit_head,
    _fit_hierarchical,
    collapse_rare_categories,
    evaluate,
)


def _synthetic_records(n=200):
    records = []
    for i in range(n):
        if i % 2 == 0:
            records.append(
                {
                    "threadId": f"gh{i}",
                    "subject": "pull request opened review needed",
                    "body": "a github pull request body with code review",
                    "senderDomain": ".*@github\\.com$",
                    "senderHash": "gh",
                    "isReceived": True,
                    "isRead": False,
                    "hasAttachments": False,
                    "receivedAt": f"2026-05-{(i % 28) + 1:02d}T09:00:00.000Z",
                    "category": "GitHub PRs",
                    "categoryIsUserCorrected": False,
                    "priorityScore": 50,  # high
                }
            )
        else:
            records.append(
                {
                    "threadId": f"nl{i}",
                    "subject": "weekly newsletter digest unsubscribe",
                    "body": "this week in tech newsletter content here",
                    "senderDomain": ".*@news\\.com$",
                    "senderHash": "nl",
                    "isReceived": True,
                    "isRead": True,
                    "hasAttachments": False,
                    "receivedAt": f"2026-05-{(i % 28) + 1:02d}T09:00:00.000Z",
                    "category": "Newsletters",
                    "categoryIsUserCorrected": False,
                    "priorityScore": 2,  # low
                }
            )
    return records


def _train_bundle(threads, config):
    threads, _ = collapse_rare_categories(threads, config.min_category_support)
    builder = FeatureBuilder(config=config)
    features = builder.fit_transform(threads)
    family_model, sibling_models, family_singletons = _fit_hierarchical(
        features, threads, config
    )
    return ModelBundle(
        feature_builder=builder,
        category_model=_fit_head(features, [t.category for t in threads], config),
        priority_model=_fit_head(features, [t.priority_band for t in threads], config),
        thresholds=config.thresholds,
        metadata={},
        family_model=family_model,
        sibling_models=sibling_models,
        family_singletons=family_singletons,
    )


def test_pipeline_learns_separable_data():
    config = TrainConfig(min_category_support=2)
    threads = threads_from_records(_synthetic_records())
    bundle = _train_bundle(threads, config)

    report = evaluate(bundle, threads)
    # cleanly separable → near-perfect on the (in-sample here) data
    assert report["category_flat"]["accuracy_full"] > 0.95
    assert report["category_hierarchical"]["family_accuracy_full"] > 0.95
    assert report["priority"]["band_accuracy_full"] > 0.95


def test_confident_thread_classified_without_fallback():
    config = TrainConfig(min_category_support=2)
    threads = threads_from_records(_synthetic_records())
    bundle = _train_bundle(threads, config)

    gh = next(t for t in threads if t.category == "GitHub PRs")
    pred = predict_thread(bundle, gh)
    assert pred.category == "GitHub PRs"
    assert pred.category_fallback is False
    assert pred.priority_band == "high"
