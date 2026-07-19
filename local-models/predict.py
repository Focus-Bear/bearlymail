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
from functools import lru_cache

import joblib

from dataset import Thread
from model import ModelBundle, Prediction, predict_thread


def load_bundle(path: str) -> ModelBundle:
    """Load a model bundle from a local path."""
    return joblib.load(path)


@lru_cache(maxsize=8)
def load_bundle_from_s3(bucket: str, key: str) -> ModelBundle:
    """Load and cache a model bundle from S3 (one per user). Cached by
    (bucket, key) so a warm Lambda reuses the already-downloaded model."""
    import boto3  # imported lazily so local/test use needs no AWS deps

    s3 = boto3.client("s3")
    response = s3.get_object(Bucket=bucket, Key=key)
    return joblib.load(io.BytesIO(response["Body"].read()))


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
