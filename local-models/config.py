"""
Central configuration for the local category/priority models.

Everything tunable lives here so the training script, the predictor, and the
tests all agree on the same numbers. The confidence thresholds are the knobs
that trade coverage (how many threads the local model handles) against accuracy
(how often it agrees with the LLM); see README.md for the measured trade-off.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# How much of the body to keep as the "light text" feature (brief §6). The full
# body is expensive and mostly noise for routine mail; the first few hundred
# characters carry the signal (greeting, first line, sender boilerplate).
BODY_SNIPPET_CHARS = 500

# Priority band edges. priorityScore is the LLM's 0-100-ish score (the export
# shows it can dip slightly negative). Bands make confidence easy to reason
# about and are easier to calibrate than regression for a first version
# (brief §5). Edges chosen from the score distribution: roughly even low/med
# split with a smaller genuinely-high-priority tail.
PRIORITY_BAND_EDGES = (10, 35)  # low < 10 <= med < 35 <= high
PRIORITY_BANDS = ("low", "med", "high")

# Label used for a thread the LLM left uncategorised (export `category` is null).
OTHER_CATEGORY = "Other"

# Recency (time-decay) weighting of training labels. Historical labels include
# stale, bad ones (from now-removed over-broad rules), so we want the model to
# lean on recent, cleaner labels without a hard recent-only window — a hard
# window collapses rare categories that only have a handful of (older) examples.
# Instead each thread's sample weight is multiplied by an exponential decay of
# its age, measured against the export's newest thread (not wall-clock, so the
# run stays deterministic/reproducible like the time-based split).
#
# Half-life: a thread ~one half-life old counts half as much as a brand-new one.
# 90 days is a deliberately gentle default — over a multi-month export the most
# recent quarter carries the most weight while older data still contributes, and
# over a short (few-week) export the spread is small (nothing drops below ~0.85),
# so decay can never starve rare categories the way a 2-week cutoff would.
# Empirically (A/B on a real 3-week mailbox) 90 days was the point where the
# hierarchical category path improved on every metric with no coverage regression,
# while shorter half-lives (30-60d) traded a little more coverage for accuracy;
# see the PR description for the full sweep.
RECENCY_HALF_LIFE_DAYS = 90.0

# Floor so ancient data still contributes a little (never 0): even threads many
# half-lives old keep this minimum weight, preserving rare-category signal.
RECENCY_MIN_WEIGHT = 0.1


@dataclass(frozen=True)
class Thresholds:
    """
    Confidence gates for the fallback decision (brief §8).

    Category (flat model): trust the local prediction only when the top class is
    both probable enough AND clearly ahead of the runner-up — the margin check
    stops the model committing when it's torn between two similar categories.

    Hierarchical category: the family gate is the coarse decision (is this
    broadly a GitHub PR / a newsletter / a meeting?), and the sibling gate is the
    fine decision within that family. A WRONG FAMILY is the worst failure mode —
    it drops the email into a totally unrelated bucket — so the family gate is
    deliberately STRICTER than the flat-category gate: when the model isn't
    strongly confident about the family (high top-prob AND a wide margin over the
    runner-up), it abstains and defers to the LLM rather than committing a
    plausible-but-wrong family. The sibling gate guards the near-duplicate
    confusions within a (now confident) family.

    Priority: a single top-probability gate on the predicted band.
    """

    category_min_prob: float = 0.60
    category_min_margin: float = 0.15
    priority_min_prob: float = 0.60

    # Family gate is stricter than the flat-category gate on purpose: a wrong
    # family is a "REALLY bad" mis-file, so we only commit a family when it is
    # clearly the winner, otherwise we escalate to the LLM.
    family_min_prob: float = 0.70
    family_min_margin: float = 0.20
    sibling_min_prob: float = 0.50


DEFAULT_THRESHOLDS = Thresholds()


@dataclass(frozen=True)
class TrainConfig:
    """Knobs for the training run."""

    # Fraction of threads (oldest first) used for training; the rest are the
    # held-out, more-recent test set. A time-based split, never random, so we
    # never evaluate on threads from the same period we trained on (brief §9).
    train_fraction: float = 0.80

    # A category needs at least this many training threads to be learnable;
    # rarer ones collapse into Other so the model isn't graded on classes it
    # has almost no signal for. They keep falling back to the LLM until they
    # accumulate enough examples.
    min_category_support: int = 5

    # TF-IDF vocabulary cap and n-gram range for the subject+snippet text.
    tfidf_max_features: int = 20000
    tfidf_ngram_max: int = 2
    tfidf_min_df: int = 2

    # Inverse-regularisation strength for the logistic-regression heads.
    logreg_c: float = 4.0
    logreg_max_iter: int = 2000

    # Add the sender's learned majority category/family as one-hot features.
    # Measured neutral-to-slightly-negative on the current data (a hard majority
    # one-hot overfits sender identity that drifts across the time split, and the
    # text + domain features already carry most of the signal), so it's off by
    # default. Kept behind a flag to revisit with smoothed probabilities.
    use_sender_history: bool = False

    # Recency (time-decay) weighting of category training labels. When on, each
    # thread's sample weight is scaled by an exponential decay of its age so
    # recent, cleaner labels count more than stale ones (see the module-level
    # constants above). Togglable so the effect can be A/B'd against the flat
    # (all-1.0) weighting. Composes with the user-correction multiplier: the
    # final weight is base(1.0) x recency_decay x correction(3.0 if corrected).
    recency_decay_enabled: bool = True
    recency_half_life_days: float = RECENCY_HALF_LIFE_DAYS
    recency_min_weight: float = RECENCY_MIN_WEIGHT

    thresholds: Thresholds = field(default_factory=lambda: DEFAULT_THRESHOLDS)


DEFAULT_TRAIN_CONFIG = TrainConfig()
