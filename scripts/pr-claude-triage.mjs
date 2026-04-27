#!/usr/bin/env node
/**
 * Open PR rollup: CI check runs + unresolved inline review threads from Gemini Code Assist.
 *
 * Auth: `GITHUB_TOKEN` or `GH_TOKEN`, or the GitHub CLI (`gh auth login`) — token is auto-filled
 * via `gh auth token` when env vars are unset (same as scripts/pr-claude-triage.sh).
 *
 * Usage:
 *   ./scripts/pr-claude-triage.sh
 *   node scripts/pr-claude-triage.mjs
 *   node scripts/pr-claude-triage.mjs --json
 *   node scripts/pr-claude-triage.mjs --pr 1852
 *   node scripts/pr-claude-triage.mjs --dry-run
 *
 * By default, posts an @claude triage comment when CI failures, merge conflicts, or
 * Gemini threads need work — **except** that merge conflicts are routed to a local `claude -p`
 * session in an isolated git worktree (`.claude/worktrees/conflict-pr-{N}`) when a usable local
 * clone is available. If the local clone, origin remote, or `claude` CLI is missing, falls back
 * to the @claude github ping for conflicts. (Not for missing/under-counted check runs; those are nudged via an **automatic**
 * empty commit in code — see `PR_TRIAGE_AUTO_EMPTY_COMMIT_WHEN_CHECK_RUNS_BELOW`). Not for workflow
 * approval or "wait for more green checks" / merge-block only (see PR_TRIAGE_MIN_PASSED_CHECKS). For blocked
 * workflow runs it tries POST …/actions/runs/{id}/approve
 * (where GitHub allows), then **pushes an empty commit** on the PR branch to re-trigger CI if runs stay
 * blocked (Git Data API by default; set `PR_TRIAGE_USE_LOCAL_GIT=1` to use your clone: empty commit, `push`,
 * then `git checkout -`). Use `--dry-run` to only print.
 *
 * Fetches check runs for the head **before** workflow handling: if any are queued or in progress, this run
 * does not approve workflows or push any empty commit (it waits; next invocation re-evaluates).
 * After that, if the head has **fewer** than `PR_TRIAGE_AUTO_EMPTY_COMMIT_WHEN_CHECK_RUNS_BELOW` check run
 * rows (default: 5), and none are in progress, no failed checks, and the tip is not already the triage
 * empty-commit message, an empty commit is pushed to seed/re-run CI.
 * Note: the PR “Checks” UI can show “All checks have passed” for the runs that *exist* while the main
 * matrix was **skipped** (path filters, `if:` conditions) — the REST check-runs API may list `conclusion:
 * "skipped"` for some jobs, or only a few runs (e.g. one CodeQL) if other workflows never created runs.
 *
 * After PRs, finds remote `claude/*` branches with no open PR and **opens a pull request** for each branch
 * whose **first commit vs the default branch** is **within the last 7 days** (via compare API), unless
 * `--no-create-orphan-prs` or `--dry-run`. **Does not** open a PR if the branch is not ahead of `main`
 * (`ahead_by=0`) or if a **merged** PR already used the same head SHA (stops repeat opens after squash merge
 * when the remote branch was not deleted). With `--delete-merged-claude-branches`, those skips also
 * **delete** the remote `claude/...` ref. PR titles use **#issue issue title** when the branch matches
 * `claude/issue-{N}-...`. Skips PR creation when `--pr N` is set. Results: `orphan_claude_branches`,
 * `orphan_claude_pr_creation`.
 *
 * Env:
 *   GITHUB_REPOSITORY     default Focus-Bear/BearlyMail
 *   GEMINI_REVIEW_BOTS     comma-separated GitHub logins (default: gemini-code-assist)
 *   GEMINI_ACTIONED_LABEL  if this label is on the PR, we trust that all Gemini feedback is addressed
 *                            (Claude/author can add it when inline threads are not or cannot be "Resolved"
 *                            in the API). Default: all-gemini-feedback-actioned
 *   GEMINI_CLAUDE_ATTESTATION_SUBSTRING  if the latest issue comment from CLAUDE_ISSUE_COMMENT_BOTS contains
 *                            this substring (case-insensitive), treat Gemini inline threads as non-blocking
 *                            for triage/ping/labels — same intent as GEMINI_ACTIONED_LABEL but driven by Claude's
 *                            reply. Default: All gemini comments resolved. Set to empty to disable.
 *   CLAUDE_ISSUE_COMMENT_BOTS  comma-separated logins for “Claude bot” issue comments (default:
 *                            github-actions,github-actions[bot]) — used only for attestation detection above.
 *   PR_TRIAGE_BASE_BRANCH  override base branch for orphan PRs (default: repo default branch from API)
 *   PR_TRIAGE_USE_LOCAL_GIT  if "1"/"true": push empty commit via local `git` (opt-in) instead of the Git
 *                            Data API, then `git checkout -` so the shell returns to the previous branch.
 *                            Implies a clean worktree and `origin` for this repository.
 *   PR_TRIAGE_GIT_CWD       directory for the above (default: cwd). Must match the repo you pass with -R.
 *   PR_TRIAGE_STATE_LABELS  empty = disable all triage state labels. Otherwise: remove script-managed labels
 *                            at the start of each PR, then apply one state label matching current CI/Gemini/merge
 *   PR_TRIAGE_MIN_PASSED_CHECKS  minimum completed *success* check runs before “ready” (default 7; 0 = off)
 *   PR_TRIAGE_AUTO_EMPTY_COMMIT_WHEN_CHECK_RUNS_BELOW  if check run *count* on the head is **below** this (default: 5),
 *                            push the automated empty commit when not busy/failing (0 = never by this path)
 *   PR_TRIAGE_LABEL_*      override names (see DEFAULT_TRIAGE_STATE_LABELS in source): MERGE_CONFLICT,
 *                            MERGE_STATE_UNKNOWN, CI_FAILING, INSUFFICIENT_SUCCESS, GEMINI_REVIEW, …
 */

import { main } from "./pr-claude-triage/cli.mjs";

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
