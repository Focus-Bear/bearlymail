# Plan: Fix Deploy — Build batch-analyzer Lambda Before CDK Synth

**Issue:** #1467
**Priority:** P0 — All deploys to main are blocked
**Author:** 🔍 Monk of Modularity

## Root Cause

Commit `00b6623a` (PR #1446) added the `BearlyMailContextAnalysisStack` which references
`lambda/batch-analyzer/dist` as a Lambda code asset. The deploy workflow (`deploy.yml`) never
builds that Lambda, so CDK synth fails with:

```
ValidationError: Cannot find asset at lambda/batch-analyzer/dist
```

CDK synthesizes **all stacks** in the app even when you only `cdk deploy BearlyMailStack`,
so the missing `dist/` directory causes a hard failure.

## Changes Required

### 1. Add Lambda build step to `deploy.yml`

**File:** `.github/workflows/deploy.yml`
**Location:** In the `deploy-backend` job, **before** the "CDK Deploy Application Stack" step (line ~276)

Add:

```yaml
      - name: Build batch-analyzer Lambda
        working-directory: lambda/batch-analyzer
        run: |
          npm ci
          npm run build
```

This runs `tsc` and copies prompt files into `dist/`, producing the asset CDK needs.

### 2. Deploy the ContextAnalysis stack alongside BearlyMailStack

**File:** `.github/workflows/deploy.yml`
**Location:** The CDK deploy command (line ~276)

Change:

```yaml
          cdk deploy BearlyMailStack \
            --require-approval never \
            --outputs-file cdk-outputs.json
```

To:

```yaml
          cdk deploy BearlyMailStack BearlyMailContextAnalysisStack \
            --require-approval never \
            --outputs-file cdk-outputs.json
```

Without this, the new stack will never actually deploy even after the build fix.

### 3. (Optional) Add Lambda build to CI workflow

**File:** `.github/workflows/ci.yml`

Consider adding a build check for `lambda/batch-analyzer/` in CI so TypeScript
compilation errors are caught before merge. This is not blocking but prevents future
regressions.

## Other Lambdas

Checked `lambda/` directory — `batch-analyzer` is the **only** Lambda in the repo.
No other Lambda directories exist, so no other functions have this problem.

## Verification

After the fix:
1. The deploy workflow should successfully run `cdk synth` (which validates all stacks)
2. Both `BearlyMailStack` and `BearlyMailContextAnalysisStack` should deploy
3. The batch-analyzer Lambda should appear in AWS Lambda console

## Risk Assessment

- **Low risk** — adding a build step and an additional stack to the deploy command
- The Lambda code has already been reviewed and merged (PR #1446)
- No production behavior changes; this just unblocks the pipeline
