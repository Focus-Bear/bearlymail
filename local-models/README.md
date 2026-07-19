# Local models for email category & priority (with LLM fallback)

A cheap, local first-pass model that predicts a thread's **category** and
**priority** and says how confident it is. When it's confident, BearlyMail uses
its answer and skips the LLM; when it isn't, the thread falls through to the
existing LLM pipeline unchanged. This is the hybrid system described in the
[brief](../docs) — local for the easy, repetitive majority, LLM for the hard tail.

This is the v1 experiment. It trains on the **labels the product already
produces** — the LLM-assigned category/priority stored on each thread, plus user
corrections — not on hand-written rules. (The earlier attempt, PR #2160, trained
a classifier whose labels came from deterministic rule matches and modelled no
priority at all; this replaces that approach.)

## Results on a real mailbox

Trained and evaluated on a real 5,000-email export (2,954 threads, ~3 weeks).
**Time-based split**: oldest 80% of threads train, most recent 20% test — so we
never evaluate on threads from the same period we trained on, and no thread
appears on both sides.

The point of the system is the **confidence gate**, not raw accuracy. Category
across ~66 user-specific classes is genuinely hard (full accuracy 47%), but the
model knows *when* it's right, so it can confidently handle a meaningful slice at
high accuracy and defer the rest:

**Category** — coverage vs accuracy as the gate tightens:

| top-prob ≥ | margin ≥ | coverage (handled locally) | accuracy on covered |
| ---------: | -------: | -------------------------: | ------------------: |
|       0.50 |     0.10 |                      48.1% |               0.718 |
|       0.60 |     0.15 |                      38.9% |               0.774 |
|       0.70 |     0.20 |                      29.8% |               0.858 |
|       0.80 |     0.25 |                      23.4% |               0.906 |

**Priority** — the thing the rules-based approach couldn't do at all — is much
more learnable locally:

| top-prob ≥ | coverage | band accuracy on covered |
| ---------: | -------: | -----------------------: |
|       0.50 |    92.7% |                    0.776 |
|       0.60 |    81.4% |                    0.819 |
|       0.70 |    68.2% |                    0.856 |
|       0.80 |    55.5% |                    0.881 |

Full-population priority (no gate): band accuracy 0.755, and a regression
baseline gives MAE 7.2 against a label standard deviation of 15.0.

Read each row as: *"at this gate, the local model answers X% of threads with Y
accuracy, and the LLM handles the other (100−X)%."* The default thresholds
(category 0.60/0.15, priority 0.60) sit at a deliberately conservative
operating point; they're a single config change in [`config.py`](config.py).

Coverage is low for flat category only because this mailbox is three weeks of a
single, very dev-heavy inbox (≈57% GitHub) with a long tail of categories that
have only a handful of examples each, many of them near-duplicates. Coverage
grows directly with labelled history, so it improves on its own as the model is
retrained — and the hierarchy below recovers most of it now.

### Hierarchical category (family → sibling)

The error analysis showed the flat model is mostly right at the *family* level
(GitHub PR / Newsletter / Meeting / …) and loses accuracy only choosing between
near-duplicate siblings within a family. So category is predicted in two stages:
a **family head** picks the broad family, then a per-family **sibling head**
picks the exact category. ([`taxonomy.py`](taxonomy.py) maps the ~90 categories
to 17 families with keyword rules on the category name.)

The family level is reliable and high-coverage — this is the part worth
surfacing in the product:

| level | full accuracy | coverage @ gate | accuracy on covered |
| ----- | ------------: | --------------: | ------------------: |
| **family** (broad) | 74% | **76%** | **85%** |
| full category (family+sibling) | 46% | 33–61% | 0.61 → 0.80 as the sibling gate tightens |

So for ~3 out of 4 threads the model confidently knows the family at 85%
accuracy. When the family is confident but the sibling isn't, the caller has a
cheaper option than a full fallback: store the family as a coarse label, or send
a **family-scoped** LLM query (choose among ~6 siblings, not ~90 categories).

### Relabeling lift

The category labels in the export come from a cheap LLM and are noisy: on the
full set a careful strong-model relabel ([`relabel.py`](relabel.py)) agreed on
the exact category only **33%** of the time, and **36% of threads (1,061) were
dumped into "Other"** despite being clearly categorisable. Those inconsistent
labels — the same email pattern landing in different near-duplicate categories —
are the ceiling on what any model can learn.

Retraining on the relabeled categories (priority labels untouched) lifts every
category metric substantially:

| metric | cheap labels | relabeled |
| ------ | -----------: | --------: |
| family accuracy (full) | 74% | **85%** |
| family coverage @ gate | 76% @ 85% acc | **83% @ 95% acc** |
| full category, covered | 61% @ 61% acc | **72% @ 80% acc** |
| flat full accuracy | 47% | **64%** |

i.e. with clean labels the model confidently assigns the **family for 83% of
threads at 95% accuracy**, and the exact category for 72% at 80%. The relabel is
run by a strong model over batches prepared by `relabel.py` (the production run
used a 50-agent workflow); it should be re-run periodically as labels drift.

**Priority** was relabeled the same way, but the labeller is given the user's
own context (goals, VIP senders, urgent vs not-important criteria) so the bands
reflect *their* priorities, not generic importance. It agreed with the cheap
labels only **60%** of the time and pushed far more threads to **low** (the cheap
LLM over-rated routine GitHub/newsletter noise as medium). Retraining on it:

| priority metric | cheap labels | relabeled |
| --------------- | -----------: | --------: |
| band accuracy (full) | 0.755 | **0.792** |
| covered accuracy @ gate | 0.819 @ 81% | **0.842 @ 86%** |
| macro-F1 | 0.672 | 0.632 |

Accuracy and coverage improve; macro-F1 dips because the personalised relabel
makes "high" genuinely rarer, so the equal-weighted average is dominated by the
larger "low" class. That's a real distribution shift (more things truly are low
priority for this user), not noise — but it means the rare "high" band is worth
watching, and the confidence gate routing uncertain threads to the LLM matters
most there.

## How it works

```
 export (POST /emails/export, decrypted)  ─┐
                                           ▼
 dataset.py   load → collapse emails to threads (1 thread = 1 example)
                                           │
 features.py  FeatureBuilder: subject+snippet TF-IDF, sender domain one-hot,
              sender frequency, is_reply / hour / dow / attachments / length
                                           │
 train.py     time-split → fit category head + priority-band head (logistic
              regression) → evaluate at the confidence gates → save bundle
                                           │
                                           ▼
              model.joblib  (FeatureBuilder + both heads + thresholds + metrics)
                                           │
 predict.py / lambda_handler.py  load bundle (local or S3) → predict_thread →
              { category, priority band, confidence, per-head fallback flag }
```

`features.py` is the single source of truth for vectorisation and is saved
**inside** the bundle, so a thread is turned into features identically at train
and serve time — no train/serve skew.

### Model choice

Logistic regression on sparse TF-IDF + metadata, per the brief's recommended
starting point: fast to train, quick to iterate, easy to inspect, and it gives
calibrated-enough class probabilities to drive the confidence gate. Priority is
modelled as **band classification** (low/med/high) so its confidence is just a
class probability; a regression baseline is reported for context. Heavier
options (gradient-boosted trees, local embeddings) are the obvious next step
if/when this baseline plateaus — they slot in behind the same FeatureBuilder.

### Labels

- **Category** — the thread's stored category; `category` null ⇒ `Other`. User
  corrections (`categoryIsUserCorrected`) are a stronger signal and are exported
  for weighting/precedence (this mailbox had only 4, so it doesn't move the
  numbers yet).
- **Priority** — the stored `priorityScore`, banded. `userPriorityOverride`
  takes precedence where present.

Categories with fewer than `min_category_support` (default 5) training threads
are collapsed to `Other` so the model isn't graded on classes it can't learn;
they keep falling back to the LLM until they accumulate enough examples.

## Usage

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 1. Get a decrypted export: download from the app (POST /emails/export),
#    unzip with your password → emails.json. NEVER commit it (see .gitignore).

# 2. Train + see the held-out evaluation report:
python train.py --export emails.json --out model.joblib
python train.py --export emails.json --report-only   # don't save

# 3. Run the tests (synthetic data, no export needed):
pytest tests/ -q
```

Inference:

```python
from predict import load_bundle, predict
bundle = load_bundle("model.joblib")
result = predict(bundle, {
    "threadId": "...", "subject": "...", "body": "...",
    "senderDomain": ".*@github\\.com$", "senderHash": "...",
    "isReceived": True, "isRead": True, "hasAttachments": False,
    "receivedAt": "2026-06-13T05:00:00.000Z", "threadLength": 3,
})
print(result.to_dict())
# {'category': '...', 'categoryConfidence': 0.88, 'categoryFallback': False,
#  'priorityBand': 'med', 'priorityConfidence': 0.88, 'priorityFallback': False}
```

## Deployment (planned)

Models are trained **offline** (locally / EC2 / SageMaker) and the per-user
bundle is stored in S3; [`lambda_handler.py`](lambda_handler.py) loads it
(cached per warm container) and serves predictions. The server calls it *before*
the LLM pipeline: for each head where `*Fallback` is false it persists the local
prediction; otherwise it continues through the existing LLM path. New users with
no bundle yet get `*Fallback: true` for both heads — cold start = LLM, as the
brief specifies.

Integration points where category/priority are assigned today (call the local
model first, fall back into these): `server/src/emails/llm-priority-batch.service.ts`,
`server/src/emails/email-priority-explanation.service.ts`.

## Rollout — shadow mode first

The evaluation in `train.py` *is* the shadow-mode comparison run offline: the
local model predicts, and we measure agreement with the LLM labels and user
corrections on a held-out, time-split set. Before anything is user-visible, run
the same comparison online — local model predicts in the background, the LLM
still drives the product — and watch coverage and agreement. Promote head-by-head
(priority is the stronger candidate to go first) once the live numbers hold.

Because inboxes drift, keep sending a sample of threads through the LLM even
after launch to refresh labels, detect drift, and trigger retraining (weekly, or
after enough new labelled threads accumulate).

## Files

| File                 | Role                                                                 |
| -------------------- | ------------------------------------------------------------------- |
| `config.py`          | All tunables: band edges, confidence thresholds, training knobs.    |
| `dataset.py`         | Load export → thread-level examples; banding; time-based split.     |
| `features.py`        | `FeatureBuilder` — shared train/serve feature engineering.          |
| `model.py`           | `ModelBundle`, `Prediction`, and the `predict_thread` fallback logic. |
| `train.py`           | Train both heads, evaluate at the gates, save the bundle.           |
| `predict.py`         | Load a bundle (local or S3) and score payloads.                    |
| `lambda_handler.py`  | AWS Lambda entry point for per-user S3-backed inference.            |
| `tests/`             | Unit + integration tests (synthetic data; no real export needed).  |
```
