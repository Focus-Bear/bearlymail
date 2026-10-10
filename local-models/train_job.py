"""
Batch training entry point for the scheduled retrain task.

Runs in a Fargate task on a weekly cron (see the serving CDK stack). For each
per-user training export in S3 it trains a fresh bundle and uploads it, so the
served models keep up with new threads and user corrections — the
self-improvement loop.

Data flow (one bucket, two prefixes):
    s3://<bucket>/<TRAINING_DATA_PREFIX><userId>.json          (label-rich export in)
        → train(export) →
    s3://<bucket>/<MODELS_PREFIX><userId>/<version>.joblib     (served bundle out)
    s3://<bucket>/<MODELS_PREFIX><userId>/current.json         (pointer → version)

Bundles are written under a per-retrain versioned key and a small `current.json`
pointer is updated LAST to name the new version. The inference Lambda reads that
pointer, so a retrain is picked up immediately by warm containers (the old flat
`<MODELS_PREFIX><userId>.joblib` path never changed key, so warm containers kept
serving the stale model until they recycled). Versioning also gives rollback and
provenance — old versions are retained under their timestamped keys.

The export carries the LLM/user category and priority labels (and the
`categoryIsUserCorrected` flag), so retraining naturally folds in corrections.
Producing those exports is the data-feed step (the export service / a per-user
export job) and is intentionally decoupled from training.

Env:
    LOCAL_MODELS_BUCKET    bucket holding both prefixes (required)
    TRAINING_DATA_PREFIX   default "training-data/"
    MODELS_PREFIX          default "models/"
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from datetime import datetime, timezone

import boto3
import joblib

from train import train

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("train_job")


def _user_id_from_key(key: str, prefix: str) -> str | None:
    name = key[len(prefix) :]
    if not name.endswith(".json"):
        return None
    return name[: -len(".json")]


def _publish_bundle(
    s3, bucket: str, models_prefix: str, user_id: str, bundle_path: str
) -> str:
    """Upload a freshly trained bundle under a versioned key and point the user's
    `current.json` at it. The pointer is written LAST so a concurrent reader
    never sees a pointer to a not-yet-uploaded bundle. Returns the versioned key.
    """
    version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    versioned_key = f"{models_prefix}{user_id}/{version}.joblib"
    s3.upload_file(bundle_path, bucket, versioned_key)

    pointer_key = f"{models_prefix}{user_id}/current.json"
    pointer_body = json.dumps(
        {"key": versioned_key, "version": version}
    ).encode("utf-8")
    s3.put_object(
        Bucket=bucket,
        Key=pointer_key,
        Body=pointer_body,
        ContentType="application/json",
    )
    return versioned_key


def run() -> dict[str, int]:
    bucket = os.environ["LOCAL_MODELS_BUCKET"]
    data_prefix = os.environ.get("TRAINING_DATA_PREFIX", "training-data/")
    models_prefix = os.environ.get("MODELS_PREFIX", "models/")
    s3 = boto3.client("s3")

    trained = failed = skipped = 0
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=data_prefix):
        for obj in page.get("Contents", []):
            user_id = _user_id_from_key(obj["Key"], data_prefix)
            if not user_id:
                skipped += 1
                continue
            try:
                with tempfile.TemporaryDirectory() as tmp:
                    export_path = os.path.join(tmp, "emails.json")
                    s3.download_file(bucket, obj["Key"], export_path)
                    bundle, report = train(export_path)
                    bundle_path = os.path.join(tmp, "model.joblib")
                    joblib.dump(bundle, bundle_path)
                    _publish_bundle(
                        s3, bucket, models_prefix, user_id, bundle_path
                    )
                trained += 1
                logger.info(
                    "trained %s: %s test threads",
                    user_id,
                    report.get("test_threads"),
                )
            except Exception:  # noqa: BLE001 — one bad user must not stop the batch
                failed += 1
                logger.exception("training failed for %s", user_id)

    logger.info("done: trained=%d failed=%d skipped=%d", trained, failed, skipped)
    return {"trained": trained, "failed": failed, "skipped": skipped}


if __name__ == "__main__":
    run()
