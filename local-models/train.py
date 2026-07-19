"""
Train per-user local category + priority models from a BearlyMail export.

Pipeline (brief §9):
  1. load the export and collapse emails to threads (one thread = one example)
  2. time-split into train / held-out test (never random)
  3. collapse rare categories into Other so the model isn't graded on classes
     it has too little signal for
  4. fit the shared FeatureBuilder, then:
       * a flat category head (baseline),
       * a hierarchical category head: a family head + per-family sibling heads,
       * a priority-band head
  5. evaluate on the held-out test set at the configured confidence thresholds —
     this is the shadow-mode report: coverage (how many threads handled locally)
     and accuracy-on-covered (how often the local call matches the LLM)
  6. save the bundle (joblib)

Usage:
    python train.py --export path/to/emails.json --out model.joblib
    python train.py --export path/to/emails.json --report-only   # no save
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from typing import Any

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, mean_absolute_error

from config import DEFAULT_TRAIN_CONFIG, OTHER_CATEGORY, TrainConfig
from dataset import Thread, load_threads, time_split
from features import FeatureBuilder
from model import (
    ModelBundle,
    _predict_category_flat,
    predict_thread,
)
from taxonomy import assign_family


def collapse_rare_categories(
    threads: list[Thread], min_support: int
) -> tuple[list[Thread], list[str]]:
    """Relabel any category with fewer than `min_support` training threads to
    Other, in place. Returns (threads, kept_category_list). Rare categories keep
    falling back to the LLM until they have enough examples to be learnable."""
    counts = Counter(t.category for t in threads)
    kept = {c for c, n in counts.items() if n >= min_support or c == OTHER_CATEGORY}
    for t in threads:
        if t.category not in kept:
            t.category = OTHER_CATEGORY
    return threads, sorted(kept)


def _fit_head(
    features,
    labels: list[str],
    config: TrainConfig,
    sample_weight: list[float] | None = None,
) -> LogisticRegression:
    model = LogisticRegression(
        max_iter=config.logreg_max_iter,
        C=config.logreg_c,
        class_weight="balanced",  # the label distribution is very skewed
    )
    # class_weight balances across classes; sample_weight additionally up-weights
    # individual high-signal examples (user-corrected category labels).
    model.fit(features, labels, sample_weight=sample_weight)
    return model


def _fit_hierarchical(
    features, threads: list[Thread], config: TrainConfig
) -> tuple[LogisticRegression, dict[str, LogisticRegression], dict[str, str]]:
    """Train the family head and a sibling head per family that has ≥2
    categories; single-category families are recorded as singletons. User
    corrections are up-weighted via each thread's sample weight."""
    families = [assign_family(t.category) for t in threads]
    weights = [t.weight for t in threads]
    family_model = _fit_head(features, families, config, sample_weight=weights)

    rows_by_family: dict[str, list[int]] = defaultdict(list)
    for i, fam in enumerate(families):
        rows_by_family[fam].append(i)

    sibling_models: dict[str, LogisticRegression] = {}
    family_singletons: dict[str, str] = {}
    for fam, rows in rows_by_family.items():
        categories = [threads[i].category for i in rows]
        if len(set(categories)) >= 2:
            sibling_models[fam] = _fit_head(
                features[rows],
                categories,
                config,
                sample_weight=[threads[i].weight for i in rows],
            )
        else:
            family_singletons[fam] = categories[0]
    return family_model, sibling_models, family_singletons


def _coverage_report(fallback: np.ndarray, correct: np.ndarray) -> dict[str, float]:
    """Coverage = share of threads handled locally; accuracy-on-covered = how
    often those local answers were right."""
    covered = ~fallback
    coverage = float(covered.mean()) if len(covered) else 0.0
    acc = float(correct[covered].mean()) if covered.any() else float("nan")
    return {"coverage": coverage, "accuracy_on_covered": acc}


def evaluate(bundle: ModelBundle, test: list[Thread]) -> dict[str, Any]:
    """Full-population and confidence-gated metrics on the held-out test set,
    for the flat category head, the hierarchical category head, and priority."""
    preds = [predict_thread(bundle, t) for t in test]
    cat_true = [t.category for t in test]
    fam_true = [assign_family(t.category) for t in test]

    # --- flat category baseline ---
    flat = [_predict_category_flat(bundle, bundle.feature_builder.transform([t])) for t in test]
    flat_pred = [p.category for p in flat]
    flat_fb = np.array([p.category_fallback for p in flat])
    flat_correct = np.array([p == t for p, t in zip(flat_pred, cat_true)])

    # --- hierarchical: family level ---
    fam_pred = [p.family for p in preds]
    fam_fb = np.array([p.family_fallback for p in preds])
    fam_correct = np.array([p == t for p, t in zip(fam_pred, fam_true)])

    # --- hierarchical: full category ---
    h_pred = [p.category for p in preds]
    h_fb = np.array([p.category_fallback for p in preds])
    h_correct = np.array([p == t for p, t in zip(h_pred, cat_true)])

    # --- priority --- skip test threads with no priority band; comparing
    # predictions to a None truth would just deflate the metrics.
    pri_idx = [i for i, t in enumerate(test) if t.priority_band is not None]
    pri_true = [test[i].priority_band for i in pri_idx]
    pri_pred = [preds[i].priority_band for i in pri_idx]
    pri_fb = np.array([preds[i].priority_fallback for i in pri_idx])
    pri_correct = np.array([p == t for p, t in zip(pri_pred, pri_true)])

    report: dict[str, Any] = {
        "test_threads": len(test),
        "category_flat": {
            "accuracy_full": float(accuracy_score(cat_true, flat_pred)),
            "macro_f1_full": float(f1_score(cat_true, flat_pred, average="macro", zero_division=0)),
            **_coverage_report(flat_fb, flat_correct),
        },
        "category_hierarchical": {
            "family_accuracy_full": float(accuracy_score(fam_true, fam_pred)),
            "family_distinct": len(set(fam_true)),
            "family": _coverage_report(fam_fb, fam_correct),
            "full_category_accuracy_full": float(accuracy_score(cat_true, h_pred)),
            "full_category": _coverage_report(h_fb, h_correct),
        },
        "priority": {
            "band_accuracy_full": float(accuracy_score(pri_true, pri_pred)),
            "macro_f1_full": float(f1_score(pri_true, pri_pred, average="macro", zero_division=0)),
            **_coverage_report(pri_fb, pri_correct),
        },
    }

    pri_scores = [test[i].priority_score for i in pri_idx if test[i].priority_score is not None]
    if pri_scores:
        report["priority"]["label_std"] = float(np.std(pri_scores))
    return report


def train(
    export_path: str, config: TrainConfig = DEFAULT_TRAIN_CONFIG
) -> tuple[ModelBundle, dict[str, Any]]:
    threads = load_threads(export_path)
    train_threads, test_threads = time_split(threads, config.train_fraction)
    train_threads, kept_categories = collapse_rare_categories(
        train_threads, config.min_category_support
    )

    builder = FeatureBuilder(config=config)
    features = builder.fit_transform(train_threads)

    if len({t.category for t in train_threads}) < 2:
        raise ValueError(
            "Not enough unique categories to train the category model "
            "(need at least 2 after collapsing rare categories)."
        )

    # priority_band is None for unlabelled/draft threads — drop them and slice
    # the feature matrix to match so we never pass None labels to fit().
    pri_train_indices = [i for i, t in enumerate(train_threads) if t.priority_band is not None]
    pri_labels = [train_threads[i].priority_band for i in pri_train_indices]
    if len(set(pri_labels)) < 2:
        raise ValueError(
            "Not enough unique priority bands to train the priority model "
            "(need at least 2)."
        )
    pri_features = features[pri_train_indices]

    category_model = _fit_head(
        features,
        [t.category for t in train_threads],
        config,
        sample_weight=[t.weight for t in train_threads],
    )
    family_model, sibling_models, family_singletons = _fit_hierarchical(
        features, train_threads, config
    )
    priority_model = _fit_head(pri_features, pri_labels, config)

    metadata: dict[str, Any] = {
        "total_threads": len(threads),
        "train_threads": len(train_threads),
        "test_threads": len(test_threads),
        "user_corrected_train_threads": sum(
            1 for t in train_threads if t.category_is_user_corrected
        ),
        "kept_categories": kept_categories,
        "families": sorted(set(assign_family(t.category) for t in train_threads)),
        "train_time_range": [train_threads[0].received_at, train_threads[-1].received_at]
        if train_threads
        else [],
        "test_time_range": [test_threads[0].received_at, test_threads[-1].received_at]
        if test_threads
        else [],
        "config": {
            "train_fraction": config.train_fraction,
            "min_category_support": config.min_category_support,
        },
    }

    bundle = ModelBundle(
        feature_builder=builder,
        category_model=category_model,
        priority_model=priority_model,
        thresholds=config.thresholds,
        metadata=metadata,
        family_model=family_model,
        sibling_models=sibling_models,
        family_singletons=family_singletons,
    )

    report = evaluate(bundle, test_threads)

    # A regression baseline on priority, for context against the band model.
    # Only train/score on threads that actually have a score — a missing score
    # doesn't mean "low priority", so zero-filling would bias the baseline.
    ridge_train_indices = [i for i, t in enumerate(train_threads) if t.priority_score is not None]
    ridge_test_indices = [i for i, t in enumerate(test_threads) if t.priority_score is not None]
    if ridge_train_indices and ridge_test_indices:
        from sklearn.linear_model import Ridge

        ridge = Ridge(alpha=2.0)
        ridge.fit(
            features[ridge_train_indices],
            [train_threads[i].priority_score for i in ridge_train_indices],
        )
        test_features = builder.transform([test_threads[i] for i in ridge_test_indices])
        pri_test_true = [test_threads[i].priority_score for i in ridge_test_indices]
        report["priority"]["regression_mae"] = float(
            mean_absolute_error(pri_test_true, ridge.predict(test_features))
        )

    metadata["evaluation"] = report
    return bundle, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export", required=True, help="Path to decrypted emails.json")
    parser.add_argument("--out", default="model.joblib", help="Where to save the model bundle")
    parser.add_argument("--report-only", action="store_true", help="Train and report, don't save")
    args = parser.parse_args()

    bundle, report = train(args.export)
    print(json.dumps(report, indent=2))

    if not args.report_only:
        joblib.dump(bundle, args.out)
        print(f"\nSaved model bundle to {args.out}")


if __name__ == "__main__":
    main()
