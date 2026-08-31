"""
Inference: load a trained bundle and score threads.

This is the serve-time counterpart to `train.py`. It never imports training
code beyond the shared bundle/feature modules, so the inference path stays light
(no scikit-learn training machinery needed beyond the fitted estimators).

The model can be loaded from local disk or from S3 (the brief and the planned
Lambda deployment store the per-user bundle in S3). Bundles are cached by key so
a warm Lambda doesn't re-download on every invocation.
"""

from __future__ import annotations

import io
import json
from functools import lru_cache

import joblib

from dataset import Thread
from model import ModelBundle, Prediction, predict_thread


def _s3_client():
    """Create an S3 client. boto3 is imported lazily (provided by the Lambda
    runtime) so local/test use needs no AWS deps, and tests can monkeypatch this
    seam to inject a fake client without touching AWS."""
    import boto3

    return boto3.client("s3")


def load_bundle(path: str) -> ModelBundle:
    """Load a model bundle from a local path."""
    return joblib.load(path)


# maxsize is per warm container. 8 thrashed once more than 8 users were active
# on the same container; a fitted bundle is small, so cache more to keep
# multi-tenant containers warm. Bounded by Lambda memory, not this number alone.
@lru_cache(maxsize=64)
def load_bundle_from_s3(bucket: str, key: str) -> ModelBundle:
    """Load and cache a model bundle from S3. Cached by (bucket, key); because
    the key is now a versioned path that changes on every retrain (see
    `resolve_bundle_key`), a warm Lambda re-downloads when the model changes and
    otherwise reuses the cached bundle."""
    s3 = _s3_client()
    response = s3.get_object(Bucket=bucket, Key=key)
    return joblib.load(io.BytesIO(response["Body"].read()))


def resolve_bundle_key(bucket: str, pointer_key: str, legacy_key: str) -> str:
    """Resolve the current versioned bundle key for a user by reading the small
    pointer object the retrain job writes (`{"key": "<versioned bundle key>"}`).

    Read fresh on every invocation (intentionally NOT cached): the pointer is
    what makes a retrain visible to a warm container. It's a tiny object, so the
    hot-path cost is one small S3 GET; the expensive bundle download stays cached
    by the versioned key.

    Falls back to `legacy_key` (the old flat `models/<userId>.joblib` path) when
    no pointer exists yet — a user not retrained since versioning shipped, or a
    genuinely missing/unreadable pointer. If that legacy object is also absent,
    the caller's load raises and the handler drops to the LLM (cold start)."""
    s3 = _s3_client()
    try:
        response = s3.get_object(Bucket=bucket, Key=pointer_key)
        pointer = json.loads(response["Body"].read())
        key = pointer.get("key")
        if isinstance(key, str) and key:
            return key
    except Exception:  # noqa: BLE001 — no/unreadable pointer ⇒ try the legacy key
        pass
    return legacy_key


def thread_from_payload(payload: dict) -> Thread:
    """Build a Thread from an inference request payload. Accepts the same field
    names the export uses so a caller can pass an export-shaped record straight
    through."""
    return Thread(
        thread_id=payload.get("threadId", ""),
        subject=payload.get("subject") or "",
        body=payload.get("body") or "",
        sender_domain=payload.get("senderDomain") or "",
        sender_hash=payload.get("senderHash"),
        is_received=bool(payload.get("isReceived", True)),
        is_read=bool(payload.get("isRead", False)),
        has_attachments=bool(payload.get("hasAttachments", False)),
        received_at=payload.get("receivedAt") or "",
        thread_length=int(payload.get("threadLength") or 1),
        category="",  # unknown at inference — this is what we predict
        category_is_user_corrected=False,
        priority_score=None,
    )


def predict(bundle: ModelBundle, payload: dict) -> Prediction:
    """Score one inference payload."""
    return predict_thread(bundle, thread_from_payload(payload))
