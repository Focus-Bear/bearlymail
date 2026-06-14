"""
Feature engineering shared by training and inference.

This module is the single authority on how a Thread becomes a feature vector.
Both `train.py` and `predict.py` use the *same* fitted FeatureBuilder (it's
saved inside the model bundle), so a thread is vectorised identically at train
and serve time. If these ever diverged, the model would score live threads
against features it never trained on — the classic train/serve skew bug.

Features (brief §6):
  * light text     — subject + a short body snippet, TF-IDF (word 1-2 grams)
  * sender         — sender domain as a categorical one-hot; per-sender history:
                     how often we've seen this sender (numeric) and the sender's
                     usual category and family learned from training (one-hot)
  * metadata       — is_received, is_read, has_attachments, is_reply (Re:/Fwd:),
                     hour-of-day, day-of-week, thread length, body length

The sender-history features are learned from the *training* threads only and
applied to any thread at transform time, so they leak no label from the example
being scored — a sender unseen in training simply gets the "unknown" token.
"""

from __future__ import annotations

import datetime
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Sequence

import numpy as np
from scipy.sparse import csr_matrix, hstack
from sklearn.feature_extraction.text import TfidfVectorizer

from config import BODY_SNIPPET_CHARS, DEFAULT_TRAIN_CONFIG, TrainConfig
from dataset import Thread
from taxonomy import assign_family

# Token emitted for a sender with no learned history (unseen in training).
_UNKNOWN_SENDER_TOKEN = "?"

_REPLY_RE = re.compile(r"^\s*(re|fwd|fw)\s*:", re.IGNORECASE)


def _identity_tokenizer(value: str) -> list[str]:
    """Treat the whole string as one token (used to one-hot the sender domain).
    A module-level function rather than a lambda so the fitted vectorizer — and
    therefore the whole model bundle — is picklable for joblib/S3."""
    return [value]
# Number of dense metadata features produced by `_metadata_row`. Kept as a
# constant so tests can assert the matrix width without hard-coding it twice.
NUM_METADATA_FEATURES = 8


def _thread_text(thread: Thread) -> str:
    """Subject + body snippet — the 'light text' the text model reads."""
    return f"{thread.subject} \n {thread.body[:BODY_SNIPPET_CHARS]}"


def _hour_and_dow(received_at: str) -> tuple[int, int]:
    """(hour-of-day 0-23, day-of-week 0-6) from an ISO timestamp; (0, 0) if
    unparseable so a bad timestamp degrades gracefully instead of throwing."""
    try:
        dt = datetime.datetime.fromisoformat(received_at.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return 0, 0
    return dt.hour, dt.weekday()


def _metadata_row(thread: Thread, sender_frequency: float) -> list[float]:
    """Dense, scaled metadata features for one thread. Order is fixed and must
    match NUM_METADATA_FEATURES."""
    hour, dow = _hour_and_dow(thread.received_at)
    return [
        1.0 if thread.is_received else 0.0,
        1.0 if thread.is_read else 0.0,
        1.0 if thread.has_attachments else 0.0,
        1.0 if _REPLY_RE.match(thread.subject or "") else 0.0,
        hour / 23.0,
        dow / 6.0,
        min(thread.thread_length, 10) / 10.0,
        sender_frequency,
    ]


@dataclass
class FeatureBuilder:
    """
    Fits the text and sender-domain vocabularies on the training threads, then
    transforms any thread (train or live) into the same sparse feature space.

    The sender-frequency table is learned from training only and is a
    point-in-time "how established is this sender" signal — an unseen sender at
    serve time simply gets frequency 0, which is itself informative.
    """

    config: TrainConfig = DEFAULT_TRAIN_CONFIG
    _text_vec: TfidfVectorizer | None = None
    _domain_vec: TfidfVectorizer | None = None
    _sender_cat_vec: TfidfVectorizer | None = None
    _sender_fam_vec: TfidfVectorizer | None = None
    _sender_freq: dict[str, float] | None = None
    _sender_majority_cat: dict[str, str] = field(default_factory=dict)
    _sender_majority_fam: dict[str, str] = field(default_factory=dict)

    @staticmethod
    def _sender_key(thread: Thread) -> str:
        return thread.sender_hash or thread.sender_domain or _UNKNOWN_SENDER_TOKEN

    @staticmethod
    def _one_hot_vectorizer() -> TfidfVectorizer:
        # token_pattern=None + identity tokenizer makes each string a single
        # categorical token (no text splitting), giving a clean one-hot.
        return TfidfVectorizer(
            tokenizer=_identity_tokenizer,
            lowercase=False,
            token_pattern=None,
            norm=None,
            use_idf=False,
        )

    def fit(self, threads: Sequence[Thread]) -> "FeatureBuilder":
        self._text_vec = TfidfVectorizer(
            max_features=self.config.tfidf_max_features,
            ngram_range=(1, self.config.tfidf_ngram_max),
            min_df=self.config.tfidf_min_df,
            sublinear_tf=True,
        )
        self._text_vec.fit(_thread_text(t) for t in threads)

        self._domain_vec = self._one_hot_vectorizer()
        self._domain_vec.fit([t.sender_domain or _UNKNOWN_SENDER_TOKEN for t in threads])

        # Per-sender stats learned from training: frequency, and the sender's
        # majority category / family. A sender unseen at serve time gets
        # frequency 0 and the unknown token (itself an informative signal).
        counts: dict[str, int] = {}
        cat_by_sender: dict[str, Counter] = {}
        fam_by_sender: dict[str, Counter] = {}
        for t in threads:
            key = self._sender_key(t)
            counts[key] = counts.get(key, 0) + 1
            cat_by_sender.setdefault(key, Counter())[t.category] += 1
            fam_by_sender.setdefault(key, Counter())[assign_family(t.category)] += 1
        denom = max(counts.values()) if counts else 1
        self._sender_freq = {k: v / denom for k, v in counts.items()}
        self._sender_majority_cat = {
            k: c.most_common(1)[0][0] for k, c in cat_by_sender.items()
        }
        self._sender_majority_fam = {
            k: c.most_common(1)[0][0] for k, c in fam_by_sender.items()
        }

        if self.config.use_sender_history:
            self._sender_cat_vec = self._one_hot_vectorizer()
            self._sender_cat_vec.fit([self._sender_majority_category(t) for t in threads])
            self._sender_fam_vec = self._one_hot_vectorizer()
            self._sender_fam_vec.fit([self._sender_majority_family(t) for t in threads])
        return self

    def _check_fitted(self) -> None:
        missing = self._text_vec is None or self._domain_vec is None or self._sender_freq is None
        if self.config.use_sender_history:
            missing = missing or self._sender_cat_vec is None or self._sender_fam_vec is None
        if missing:
            raise RuntimeError("FeatureBuilder.fit() must be called before transform().")

    def _sender_frequency(self, thread: Thread) -> float:
        assert self._sender_freq is not None
        return self._sender_freq.get(self._sender_key(thread), 0.0)

    def _sender_majority_category(self, thread: Thread) -> str:
        return self._sender_majority_cat.get(self._sender_key(thread), _UNKNOWN_SENDER_TOKEN)

    def _sender_majority_family(self, thread: Thread) -> str:
        return self._sender_majority_fam.get(self._sender_key(thread), _UNKNOWN_SENDER_TOKEN)

    def transform(self, threads: Sequence[Thread]) -> csr_matrix:
        self._check_fitted()
        assert self._text_vec is not None and self._domain_vec is not None
        threads = list(threads)
        text = self._text_vec.transform(_thread_text(t) for t in threads)
        domain = self._domain_vec.transform(
            t.sender_domain or _UNKNOWN_SENDER_TOKEN for t in threads
        )
        blocks = [text, domain]
        if self.config.use_sender_history:
            assert self._sender_cat_vec is not None and self._sender_fam_vec is not None
            blocks.append(
                self._sender_cat_vec.transform(
                    self._sender_majority_category(t) for t in threads
                )
            )
            blocks.append(
                self._sender_fam_vec.transform(
                    self._sender_majority_family(t) for t in threads
                )
            )
        meta = csr_matrix(
            np.array([_metadata_row(t, self._sender_frequency(t)) for t in threads], dtype=float)
        )
        blocks.append(meta)
        return hstack(blocks).tocsr()

    def fit_transform(self, threads: Sequence[Thread]) -> csr_matrix:
        return self.fit(threads).transform(threads)
