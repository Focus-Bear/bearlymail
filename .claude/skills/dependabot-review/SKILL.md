---
name: dependabot-review
description: Review open Dependabot PRs, then approve and merge the safe ones (patch/minor bumps with green CI). Use when the user says "review the dependabot PRs", "merge the safe dependency bumps", "clear the dependabot queue", or similar. Skips major-version bumps and any PR with failing/pending CI for manual review.
---

# Dependabot PR review

Goal: clear the routine Dependabot backlog automatically while leaving risky bumps for a human.

## Definition of "safe"

A PR is **safe to auto-approve + merge** only if **all** of these hold:

1. **Author is Dependabot** (`app/dependabot`).
2. **All CI checks pass** — no `fail`, no `pending`/in-progress. If any check is still running, treat as not-yet-safe (report it, don't merge). **Check the run against the *latest* commit SHA**, not a stale earlier run — `gh pr checks` can surface an old failing run if a newer fix commit hasn't re-run yet. Cross-check `gh pr view <PR> --json headRefOid` against the run's commit.
3. **Not a major version bump.** Parse the `from` → `to` versions in the title:
   - `5.9.3 → 6.0.3` = major → **SKIP**
   - `9.2.1 → 10.0.1` = major → **SKIP**
   - GitHub Actions like `actions/cache 4 → 5` = major → **SKIP**
   - Patch (`3.1041.0 → 3.1057.0`) and minor (`3.23.6 → 3.24.0`) = **SAFE**
4. **`mergeable` is `MERGEABLE`** (no conflicts). `mergeable_state` of `blocked` is fine — it usually just means "awaiting required approval", which this skill provides.

Everything that fails any criterion is **reported, not merged** — the user reviews those by hand.

## Steps

### 1. List open Dependabot PRs

```bash
gh pr list --author "app/dependabot" --state open \
  --json number,title,headRefName,createdAt --limit 50
```

If empty, report "No open Dependabot PRs" and stop.

### 2. Pull CI status + mergeability for each

```bash
# CI checks (look for any 'fail' or pending rows)
gh pr checks <PR>

# Mergeability (gh pr view does not support mergeStateStatus; use REST API instead)
gh api repos/:owner/:repo/pulls/<PR> --jq "{title, mergeable, state: .mergeable_state}"
```

Batch these in a loop so it's one tool call, not one per PR.

### 3. Classify

Build two lists:
- **SAFE** — meets every criterion above.
- **SKIP** — major bump, failing/pending CI, or merge conflict. Note the reason for each.

### 4. Show the user the classification

Print a short table: each PR, the bump (package + from→to), and SAFE/SKIP with reason. The user gave a standing instruction to merge safe ones, so you don't need to re-ask — but the summary keeps it transparent.

### 5. Approve + merge the SAFE list

```bash
for pr in <safe-prs>; do
  gh pr review $pr --approve --body "Safe Dependabot bump (patch/minor, CI green). Auto-approved."
  gh pr merge  $pr --squash --delete-branch
done
```

### 6. Verify

Merge output is often silent on success — always confirm:

```bash
for pr in <safe-prs>; do
  gh pr view $pr --json state,mergedAt --jq '.state + " " + (.mergedAt // "not-merged")'
done
```

If any PR is still open (e.g. it went `BEHIND` because an earlier merge moved `main` and the repo requires branches be up to date), comment `@dependabot rebase` on it and tell the user it'll re-merge after CI re-runs:

```bash
gh issue comment <PR> --body "@dependabot rebase"
```

### 7. Final report

List what was merged and what was skipped (with reasons). Leave the SKIP PRs untouched.

## Investigating SKIP'd majors (when the user asks to look closer)

Green CI is **necessary but not sufficient** for a major bump. CI runs one fixed Node version (here: 24), so a bump that raises a dependency's Node floor still passes CI while quietly breaking local/other environments. Before recommending a major:

- **Check the engine floor.** Diff the lock file for the new dep's `engines.node` (and transitive deps like `yargs`). Compare against root `engines.node` and any `.nvmrc`. If the bump requires a *higher* Node than the declared floor, merging it silently raises the floor — surface it as a decision (bump `engines` + `.nvmrc`, or hold), don't auto-merge.
- **Scope the blast radius.** A dev-only tool used only in a `dev`/`scripts` entry (e.g. `concurrently` in `npm run dev`) is low-risk and never runs in CI/prod. A runtime dep or a `tsconfig`/compiler bump (e.g. `typescript` major) can break the build — read the failing logs and fix the config/code, don't just skip.
- **CI/infra action majors** (e.g. `actions/cache v4→v5`) are usually safe on GitHub-hosted runners if that job ran green on the new version — verify the relevant job actually exercised it.

## Notes

- **Never** merge a major bump or a PR with failing CI, even if the user says "merge everything" — flag those and let them confirm explicitly per-PR.
- This repo squash-merges; keep `--squash`.
- Don't `@dependabot merge` — that bypasses the approval gate. Use `gh pr merge` after approving.
- If `gh` isn't authenticated, stop and tell the user to run `gh auth login`.
