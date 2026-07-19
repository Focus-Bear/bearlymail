import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np  # noqa: E402

from config import Thresholds  # noqa: E402
from model import _top_two, predict_thread  # noqa: E402


class _FakeModel:
    """Minimal stand-in for a fitted LogisticRegression with fixed probabilities."""

    def __init__(self, classes, proba):
        self.classes_ = np.array(classes)
        self._proba = np.array([proba])

    def predict_proba(self, _features):
        return self._proba


class _FakeBuilder:
    def transform(self, threads):
        return [[0.0]] * len(threads)


class _Bundle:
    def __init__(self, category_model, priority_model, thresholds):
        self.feature_builder = _FakeBuilder()
        self.category_model = category_model
        self.priority_model = priority_model
        self.thresholds = thresholds
        self.metadata = {}


def test_top_two_returns_argmax_and_margin():
    idx, top, margin = _top_two(np.array([0.1, 0.7, 0.2]))
    assert idx == 1
    assert top == 0.7
    assert abs(margin - 0.5) < 1e-9


def test_top_two_single_class():
    idx, top, margin = _top_two(np.array([1.0]))
    assert idx == 0 and top == 1.0 and margin == 1.0


def test_confident_prediction_does_not_fall_back():
    bundle = _Bundle(
        category_model=_FakeModel(["Work", "Spam"], [0.9, 0.1]),
        priority_model=_FakeModel(["low", "med", "high"], [0.1, 0.1, 0.8]),
        thresholds=Thresholds(category_min_prob=0.6, category_min_margin=0.15, priority_min_prob=0.6),
    )
    pred = predict_thread(bundle, thread=None)
    assert pred.category == "Work"
    assert pred.category_fallback is False
    assert pred.priority_band == "high"
    assert pred.priority_fallback is False


def test_low_probability_falls_back():
    bundle = _Bundle(
        category_model=_FakeModel(["Work", "Spam"], [0.55, 0.45]),
        priority_model=_FakeModel(["low", "med", "high"], [0.4, 0.35, 0.25]),
        thresholds=Thresholds(category_min_prob=0.6, category_min_margin=0.15, priority_min_prob=0.6),
    )
    pred = predict_thread(bundle, thread=None)
    assert pred.category_fallback is True  # 0.55 < 0.6
    assert pred.priority_fallback is True  # 0.4 < 0.6


def test_narrow_margin_falls_back_even_when_probable():
    # top prob clears the bar, but it's a near-tie with the runner-up
    bundle = _Bundle(
        category_model=_FakeModel(["Work", "Personal"], [0.62, 0.38]),
        priority_model=_FakeModel(["low", "med", "high"], [0.9, 0.05, 0.05]),
        thresholds=Thresholds(category_min_prob=0.6, category_min_margin=0.15, priority_min_prob=0.6),
    )
    pred = predict_thread(bundle, thread=None)
    # margin 0.24 >= 0.15 here, so this one is actually confident
    assert pred.category_fallback is False
    # tighten: a real near-tie
    bundle2 = _Bundle(
        category_model=_FakeModel(["Work", "Personal"], [0.52, 0.48]),
        priority_model=_FakeModel(["low"], [1.0]),
        thresholds=Thresholds(category_min_prob=0.4, category_min_margin=0.15, priority_min_prob=0.6),
    )
    pred2 = predict_thread(bundle2, thread=None)
    assert pred2.category_fallback is True  # margin 0.04 < 0.15 despite prob >= 0.4
