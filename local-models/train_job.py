"""
Batch training entry point for the scheduled retrain task.

Runs in a Fargate task on a weekly cron (see the serving CDK stack). For each
per-user training export in S3 it trains a fresh bundle and uploads it, so the
served models keep up with new threads and user corrections — the
self-improvement loop.

Data flow (one bucket, two prefixes):
    s3://<bucket>/<TRAINING_DATA_PREFIX><userId>.json   (label-rich export in)
        → train(export) →
    s3://<bucket>/<MODELS_PREFIX><userId>.joblib        (served bundle out)

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

import logging
import os
import tempfile

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
                    s3.upload_file(
                        bundle_path, bucket, f"{models_prefix}{user_id}.joblib"
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
