"""
AWS Lambda entry point for local-model inference.

The planned deployment (jeznag, PR #2160 discussion): models are trained
offline and stored per-user in S3; this Lambda loads the caller's model and
returns category + priority predictions with the fallback decision. The server
calls it before the existing LLM pipeline — if a head says `*Fallback: true`,
the server continues through the LLM path for that head (brief §10).

Request event:
    {
      "userId": "...",                      # selects the per-user model in S3
      "thread": { ...export-shaped fields } # threadId, subject, body, senderDomain, ...
    }

Response:
    { "statusCode": 200, "body": { ...Prediction.to_dict() } }

Environment:
    LOCAL_MODELS_BUCKET   S3 bucket holding the per-user model bundles
    LOCAL_MODELS_PREFIX   key prefix (default "models/"); key = <prefix><userId>.joblib
"""

from __future__ import annotations

import json
import os
from typing import Any

from predict import load_bundle_from_s3, predict


def _model_key(user_id: str) -> str:
    prefix = os.environ.get("LOCAL_MODELS_PREFIX", "models/")
    return f"{prefix}{user_id}.joblib"


def _response(status: int, body: dict[str, Any]) -> dict[str, Any]:
    return {"statusCode": status, "body": json.dumps(body)}


def handler(event: dict[str, Any], _context: Any = None) -> dict[str, Any]:
    # API Gateway delivers the body as a JSON string; direct invokes pass a dict.
    if isinstance(event.get("body"), str):
        event = json.loads(event["body"])

    user_id = event.get("userId")
    thread = event.get("thread")
    if not user_id or not isinstance(thread, dict):
        return _response(400, {"error": "userId and thread are required"})

    bucket = os.environ.get("LOCAL_MODELS_BUCKET")
    if not bucket:
        return _response(500, {"error": "LOCAL_MODELS_BUCKET not configured"})

    try:
        bundle = load_bundle_from_s3(bucket, _model_key(user_id))
    except Exception as e:  # noqa: BLE001 — no model yet ⇒ cold start, use the LLM
        # No per-user model (new user / not trained yet), or a load failure
        # (missing object, permissions, corrupt bundle): tell the caller to use
        # the LLM for both heads rather than failing the request (brief §9 cold
        # start). Log so genuine config/permission/corruption errors are still
        # visible in CloudWatch, and return the full Prediction schema with
        # defaults so the caller never sees missing fields.
        print(f"local-model bundle load failed for user {user_id}: {e}")
        return _response(
            200,
            {
                "category": "",
                "categoryConfidence": 0.0,
                "categoryMargin": 0.0,
                "categoryFallback": True,
                "priorityBand": "",
                "priorityConfidence": 0.0,
                "priorityFallback": True,
                "reason": "no_model_for_user",
            },
        )

    prediction = predict(bundle, thread)
    return _response(200, prediction.to_dict())
