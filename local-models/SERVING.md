# Serving the local models on AWS

How the trained category/priority models are deployed and called in production.
The training side is in [README.md](README.md); this covers the serving path.

```
 offline trainer (EC2 / ECS task / local)          server (NestJS)
   train.py --out <userId>.joblib                     │ thread arrives / updated
        │ upload to S3                                 ▼
        ▼                                     LocalModelInferenceService
   s3://bearlymail-local-models-<acct>-<region>/      │ invoke Lambda { userId, thread }
        models/<userId>.joblib                         ▼
                                              bearlymail-local-model-inference (container Lambda)
                                                 lambda_handler.handler
                                                 → load_bundle_from_s3 (cached per warm container)
                                                 → predict_thread
                                                 ← { category, family, priorityBand, *Fallback }
                                                       │
                                                       ▼
                                     server persists local prediction where *Fallback=false,
                                     else continues through the existing LLM pipeline
```

## Infrastructure (CDK)

`infrastructure/lib/bearlymail-local-model-serving-stack.ts` provisions:

- **`bearlymail-local-models-<account>-<region>`** — S3 bucket for per-user
  bundles (`models/<userId>.joblib`), versioned (30-day non-current expiry),
  SSE, TLS-only, no public access.
- **`bearlymail-local-model-inference`** — a **container-image** Lambda built
  from [`Dockerfile`](Dockerfile). Container (not zip layer) because
  scikit-learn + scipy exceed the layer size limit. 1 GB memory, 30 s timeout,
  reserved concurrency 20, **not in the VPC** (it only reads S3 and gets the
  thread in the request — no DB access, so no ENI cold-start cost).
- IAM: the Lambda gets `s3:GetObject` on the bucket (read-only — the trainer
  writes); a CloudWatch error alarm wired to the alerting SNS topic.

The stack is wired in `infrastructure/bin/app.ts` and inherits the account's
permissions-boundary aspect like every other stack.

## Deploy

```bash
cd infrastructure
npm run build
npx cdk deploy BearlyMailLocalModelServingStack   # builds the image (needs Docker) and pushes to ECR
```

CI builds the image, so a local Docker daemon is only needed for a manual deploy.

## Producing model bundles

Training is offline (it needs the full dataset and is too heavy for Lambda):

```bash
# one bundle per user, from that user's decrypted export
python train.py --export emails-<userId>.json --out <userId>.joblib
aws s3 cp <userId>.joblib s3://bearlymail-local-models-<acct>-<region>/models/<userId>.joblib
```

This is automated by the **scheduled training task** in the serving stack: a
weekly Fargate task (`Dockerfile.train` → `train_job.py`) that reads each
per-user export under `training-data/` and writes a fresh bundle under `models/`.
New users with no bundle get `*Fallback: true` for both heads — cold start = LLM,
per the brief. The data-feed (placing per-user exports under `training-data/`) is
the export service's job and is intentionally decoupled.

## Server integration (built)

`LocalModelInferenceService` (server/src/local-model/) invokes the Lambda with
`{ userId, thread }`, parses the `Prediction`, and never throws (a model outage
just means everything falls back to the LLM). `buildLocalModelInput` constructs
the payload exactly as the export does, so serve-time features match training.

It is wired into the priority pipeline (`llm-processor.ts` single path and
`llm-priority-batch.service.ts` batch path) two ways:

- **Shadow mode** (`LOCAL_MODEL_SHADOW_ENABLED=true`): after the LLM runs, the
  service predicts in the background and logs a `local_model_shadow` line
  (category/family/priority agreement vs the LLM, including `familyAgree` /
  `llmFamily` derived via `local-model/category-family.ts`, the TS port of
  `taxonomy.assign_family`). The LLM stays authoritative.
- **Live / promotion** (`LOCAL_MODEL_LIVE_ENABLED=true`, see
  `LocalModelPromotionService`): *before* the LLM, a confident **priority**
  prediction (`priorityFallback=false` — the priority head is by far the
  strongest) sets a band-representative priority score (`priority-band.ts`
  `bandRepresentativeScore`: low→5 / med→22 / high→50, deliberately below the
  emergency-delivery threshold so a coarse band never breaks batching) and
  **skips the analyze_priority LLM call**. The category is applied alongside
  when it resolves — first by exact name, then, when the *family* head is
  confident, via a two-stage lookup restricted to the user's categories in that
  family (used only when it maps to exactly one). If nothing resolves the
  thread keeps `categoryId=null` (**Other**) with `categorySource='local'` and
  a later pass can categorise it — the LLM priority call is still saved. The
  thread is tagged `prioritySource='local'` / `categorySource='local'`
  (excluded from priority rule mining, no self-reinforcement) and
  `localModelDebug.decidedBy='local'`.
- **Forced-holdout eval** (`LOCAL_MODEL_HOLDOUT_SAMPLE_RATE=<0–100>`, default 0):
  the ordinary holdout only measures *low-confidence* threads. To measure
  **applied** accuracy — how good the confident predictions we skip the LLM on
  actually are — a deterministic per-thread sample (hash of the thread id, stable
  across re-runs) of *would-be-applied* threads is diverted to the LLM instead of
  applied locally. It logs `local_model_applied_eval` and, with shadow on, the
  usual `local_model_shadow` comparison then scores local-vs-LLM for exactly the
  threads the model was confident about (both fallbacks false). Trade-off: the
  sampled fraction is decided by the LLM rather than the local model, so keep the
  rate small (e.g. 2–5).

An unconfident priority head, a cold-start user with no bundle, or any error
falls through to the LLM. That low-confidence remainder is the **holdout**: it
runs the LLM and the shadow comparison, which is how we keep measuring the model
and collect the next round of training failures.

Required env (set on the worker):
- `LOCAL_MODEL_INFERENCE_FUNCTION` — the inference Lambda name (stack output).
- `LOCAL_MODEL_SHADOW_ENABLED` — `"true"` to turn on shadow logging.
- `LOCAL_MODEL_LIVE_ENABLED` — `"true"` to let confident predictions skip the
  LLM. Kill switch: `-c localModelLiveEnabled=false` on the CDK deploy.
- `LOCAL_MODEL_HOLDOUT_SAMPLE_RATE` — `0`–`100`, percent of would-be-applied
  confident threads diverted to the LLM to measure applied accuracy. Default `0`.
