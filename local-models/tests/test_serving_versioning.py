"""
Tests for versioned model serving (stale-warm-container bug).

Retraining used to overwrite a single flat key `models/<userId>.joblib`, so the
inference Lambda's per-key cache never invalidated and warm containers kept
serving the old model. The fix writes versioned bundles plus a `current.json`
pointer; the handler reads the pointer so the cache key changes on every retrain.
These tests exercise that round-trip with a fake S3 client (no AWS, no boto3).
"""

import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import joblib  # noqa: E402
import pytest  # noqa: E402

import predict  # noqa: E402
import train_job  # noqa: E402


class FakeS3:
    """In-memory stand-in for a boto3 S3 client. Records upload/put order so the
    'pointer written last' invariant can be asserted."""

    def __init__(self, objects: dict[str, bytes] | None = None):
        self.objects: dict[str, bytes] = dict(objects or {})
        self.writes: list[tuple[str, str]] = []  # (kind, key), in call order

    def get_object(self, Bucket: str, Key: str):
        if Key not in self.objects:
            raise KeyError(f"NoSuchKey: {Key}")  # stands in for ClientError
        return {"Body": io.BytesIO(self.objects[Key])}

    def upload_file(self, Filename: str, Bucket: str, Key: str):
        with open(Filename, "rb") as fh:
            self.objects[Key] = fh.read()
        self.writes.append(("bundle", Key))

    def put_object(self, Bucket: str, Key: str, Body: bytes, ContentType=None):
        self.objects[Key] = Body
        self.writes.append(("pointer", Key))


def _joblib_bytes(obj) -> bytes:
    buf = io.BytesIO()
    joblib.dump(obj, buf)
    return buf.getvalue()


@pytest.fixture(autouse=True)
def _clear_bundle_cache():
    # lru_cache persists across tests — clear so cached keys don't leak.
    predict.load_bundle_from_s3.cache_clear()
    yield
    predict.load_bundle_from_s3.cache_clear()


def test_resolve_bundle_key_uses_pointer_when_present(monkeypatch):
    fake = FakeS3(
        {"models/u1/current.json": json.dumps({"key": "models/u1/v2.joblib"}).encode()}
    )
    monkeypatch.setattr(predict, "_s3_client", lambda: fake)

    key = predict.resolve_bundle_key(
        "bucket", "models/u1/current.json", "models/u1.joblib"
    )
    assert key == "models/u1/v2.joblib"


def test_resolve_bundle_key_falls_back_to_legacy_without_pointer(monkeypatch):
    fake = FakeS3({})  # no pointer object at all
    monkeypatch.setattr(predict, "_s3_client", lambda: fake)

    key = predict.resolve_bundle_key(
        "bucket", "models/u1/current.json", "models/u1.joblib"
    )
    assert key == "models/u1.joblib"


def test_warm_container_picks_up_retrained_model(monkeypatch):
    """Core regression: after a retrain repoints current.json to a new versioned
    key, resolve+load must return the NEW bundle even though the old one is still
    cached under its (different) key."""
    fake = FakeS3(
        {
            "models/u1/current.json": json.dumps(
                {"key": "models/u1/v1.joblib"}
            ).encode(),
            "models/u1/v1.joblib": _joblib_bytes({"model": "v1"}),
        }
    )
    monkeypatch.setattr(predict, "_s3_client", lambda: fake)

    def load_current():
        key = predict.resolve_bundle_key(
            "bucket", "models/u1/current.json", "models/u1.joblib"
        )
        return predict.load_bundle_from_s3("bucket", key)

    assert load_current() == {"model": "v1"}

    # Simulate a retrain: upload v2 and repoint the pointer.
    fake.objects["models/u1/v2.joblib"] = _joblib_bytes({"model": "v2"})
    fake.objects["models/u1/current.json"] = json.dumps(
        {"key": "models/u1/v2.joblib"}
    ).encode()

    assert load_current() == {"model": "v2"}


def test_publish_bundle_writes_versioned_key_and_pointer_last(tmp_path, monkeypatch):
    fake = FakeS3({})
    bundle_path = tmp_path / "model.joblib"
    bundle_path.write_bytes(_joblib_bytes({"model": "fresh"}))

    # Freeze the version so the key is predictable.
    class _FixedDatetime:
        @staticmethod
        def now(_tz=None):
            import datetime as _dt

            return _dt.datetime(2026, 8, 31, 12, 0, 0, tzinfo=_dt.timezone.utc)

    monkeypatch.setattr(train_job, "datetime", _FixedDatetime)

    versioned_key = train_job._publish_bundle(
        fake, "bucket", "models/", "u1", str(bundle_path)
    )

    assert versioned_key == "models/u1/20260831T120000000000Z.joblib"
    # Bundle uploaded before the pointer, so a reader never points at a gap.
    assert fake.writes == [
        ("bundle", versioned_key),
        ("pointer", "models/u1/current.json"),
    ]
    pointer = json.loads(fake.objects["models/u1/current.json"])
    assert pointer["key"] == versioned_key


def test_publish_then_resolve_round_trips(tmp_path, monkeypatch):
    """What train_job writes is exactly what the handler resolves back."""
    fake = FakeS3({})
    bundle_path = tmp_path / "model.joblib"
    bundle_path.write_bytes(_joblib_bytes({"model": "fresh"}))

    versioned_key = train_job._publish_bundle(
        fake, "bucket", "models/", "u1", str(bundle_path)
    )

    monkeypatch.setattr(predict, "_s3_client", lambda: fake)
    resolved = predict.resolve_bundle_key(
        "bucket", "models/u1/current.json", "models/u1.joblib"
    )
    assert resolved == versioned_key
    assert predict.load_bundle_from_s3("bucket", resolved) == {"model": "fresh"}
