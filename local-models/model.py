"""
The trained model bundle and the inference / fallback decision.

A `ModelBundle` is everything needed to score a thread: the fitted
FeatureBuilder, the category heads, the priority head, and the confidence
thresholds. It is what `train.py` saves (one per user) and what `predict.py` /
`lambda_handler.py` load. Keeping the predictor here — beside the bundle it
operates on — means training and serving share one code path for the fallback
decision (brief §8).

Category is predicted hierarchically (brief follow-up): a *family* head picks
the broad family (GitHub PRs, Newsletters, Meetings, …) and a per-family
*sibling* head picks the exact category within it. The error analysis showed the
model is reliably right at the family level and only loses accuracy choosing
between near-duplicate siblings, so splitting the decision lets us commit the
family confidently and gate (or narrow the LLM fallback for) just the sibling. A
flat category head is kept too, as a baseline and for bundles trained without
the hierarchy.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
from sklearn.linear_model import LogisticRegression

from config import Thresholds
from dataset import Thread
from features import FeatureBuilder


@dataclass
class ModelBundle:
    """A self-contained, picklable per-user model."""

    feature_builder: FeatureBuilder
    category_model: LogisticRegression  # flat head (baseline / fallback)
    priority_model: LogisticRegression
    thresholds: Thresholds
    # Free-form provenance: training timestamp, row counts, eval metrics, the
    # kept category list, etc. Useful for debugging which model version scored a
    # thread and for shadow-mode comparison.
    metadata: dict[str, Any]

    # Hierarchical category heads. `family_model` predicts the family;
    # `sibling_models[family]` predicts the exact category within a family that
    # has ≥2 categories; `family_singletons[family]` is the only category for a
    # family that has exactly one. Absent (None/empty) ⇒ flat path is used.
    family_model: LogisticRegression | None = None
    sibling_models: dict[str, LogisticRegression] = field(default_factory=dict)
    family_singletons: dict[str, str] = field(default_factory=dict)

    @property
    def is_hierarchical(self) -> bool:
        return self.family_model is not None


@dataclass
class Prediction:
    """
    The local model's answer for one thread.

    `*_fallback=True` means "I'm not confident — send this to the LLM". The
    caller persists the local prediction only for the parts where fallback is
    False; everything else flows through the existing LLM pipeline unchanged.

    For category there are two gates: `family_fallback` (couldn't even place the
    broad family) and `category_fallback` (couldn't pin the exact category).
    family confident + category not ⇒ the caller knows the family and can store
    it coarsely or run a cheap family-scoped LLM disambiguation.
    """

    category: str
    category_confidence: float
    category_margin: float
    category_fallback: bool

    priority_band: str
    priority_confidence: float
    priority_fallback: bool

    family: str = ""
    family_confidence: float = 0.0
    family_fallback: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "category": self.category,
            "categoryConfidence": round(self.category_confidence, 4),
            "categoryMargin": round(self.category_margin, 4),
            "categoryFallback": self.category_fallback,
            "family": self.family,
            "familyConfidence": round(self.family_confidence, 4),
            "familyFallback": self.family_fallback,
            "priorityBand": self.priority_band,
            "priorityConfidence": round(self.priority_confidence, 4),
            "priorityFallback": self.priority_fallback,
        }


def _top_two(probabilities: np.ndarray) -> tuple[int, float, float]:
    """Return (argmax index, top probability, margin over runner-up)."""
    if probabilities.shape[0] == 1:
        return 0, float(probabilities[0]), float(probabilities[0])
    top2 = np.partition(probabilities, -2)[-2:]
    runner_up, top = float(top2[0]), float(top2[1])
    return int(probabilities.argmax()), top, top - runner_up


def _predict_priority(bundle: ModelBundle, features) -> tuple[str, float, bool]:
    proba = bundle.priority_model.predict_proba(features)[0]
    idx, top, _ = _top_two(proba)
    band = str(bundle.priority_model.classes_[idx])
    return band, top, top < bundle.thresholds.priority_min_prob


def _predict_category_flat(bundle: ModelBundle, features) -> Prediction:
    thr = bundle.thresholds
    proba = bundle.category_model.predict_proba(features)[0]
    idx, top, margin = _top_two(proba)
    category = str(bundle.category_model.classes_[idx])
    fallback = top < thr.category_min_prob or margin < thr.category_min_margin
    band, pri_top, pri_fb = _predict_priority(bundle, features)
    return Prediction(
        category=category,
        category_confidence=top,
        category_margin=margin,
        category_fallback=fallback,
        priority_band=band,
        priority_confidence=pri_top,
        priority_fallback=pri_fb,
    )


def _predict_category_hierarchical(bundle: ModelBundle, features) -> Prediction:
    thr = bundle.thresholds
    fam_proba = bundle.family_model.predict_proba(features)[0]
    fam_idx, fam_top, fam_margin = _top_two(fam_proba)
    family = str(bundle.family_model.classes_[fam_idx])
    family_fallback = fam_top < thr.family_min_prob or fam_margin < thr.family_min_margin

    sibling_model = bundle.sibling_models.get(family)
    if sibling_model is None:
        # Single-category family: committing the family commits the category.
        category = bundle.family_singletons.get(family, family)
        sib_top, sib_margin, sibling_confident = fam_top, fam_margin, True
    else:
        sib_proba = sibling_model.predict_proba(features)[0]
        sib_idx, sib_top, sib_margin = _top_two(sib_proba)
        category = str(sibling_model.classes_[sib_idx])
        sibling_confident = sib_top >= thr.sibling_min_prob

    category_fallback = family_fallback or not sibling_confident
    band, pri_top, pri_fb = _predict_priority(bundle, features)
    return Prediction(
        category=category,
        category_confidence=sib_top,
        category_margin=sib_margin,
        category_fallback=category_fallback,
        family=family,
        family_confidence=fam_top,
        family_fallback=family_fallback,
        priority_band=band,
        priority_confidence=pri_top,
        priority_fallback=pri_fb,
    )


def predict_thread(bundle: ModelBundle, thread: Thread) -> Prediction:
    """Score a single thread and decide, per head, whether to fall back to the
    LLM. Uses the hierarchical category path when the bundle has a family head,
    otherwise the flat path."""
    features = bundle.feature_builder.transform([thread])
    if getattr(bundle, "family_model", None) is not None:
        return _predict_category_hierarchical(bundle, features)
    return _predict_category_flat(bundle, features)
