export const DEFAULT_REPO = "Focus-Bear/BearlyMail";
export const API_VERSION = "2022-11-28";
export const DEFAULT_GEMINI_ACTIONED_LABEL = "all-gemini-feedback-actioned";
/** Ask Claude (in claude.yml / triage prompts) to include this exact phrase when Gemini feedback is fully handled in code. */
export const DEFAULT_GEMINI_CLAUDE_ATTESTATION_SUBSTRING = "All gemini comments resolved";
export const DEFAULT_READY_FOR_REVIEW_LABEL = "ready-for-review";

/** One label at a time; higher items win. Removed when PR leaves that state. */
export const DEFAULT_TRIAGE_STATE_LABELS = {
  mergeConflict: "triage/merge-conflict",
  mergeStateUnknown: "triage/merge-state-unknown",
  ciFailing: "triage/ci-failing",
  geminiReview: "triage/gemini-review-pending",
  workflowApproval: "triage/workflow-approval-needed",
  ciMissing: "triage/ci-missing",
  ciInProgress: "triage/ci-in-progress",
  ready: "ready-for-review",
  /** When triage ping is set but no specific label slot matches (e.g. env disabled a name). */
  needsAttention: "triage/needs-attention",
  /** `completed_ok` is below PR_TRIAGE_MIN_PASSED_CHECKS and nothing else already explains it. */
  insufficientSuccess: "triage/insufficient-check-successes",
};

export const TRIAGE_LABEL_COLORS = {
  mergeConflict: "b60205",
  mergeStateUnknown: "d4c5f9",
  ciFailing: "d93f0b",
  geminiReview: "f9d0c4",
  workflowApproval: "c2e0c6",
  ciMissing: "fef2c0",
  ciInProgress: "c5def5",
  ready: "0e8a16",
  needsAttention: "5319E7",
  insufficientSuccess: "e99695",
};

/** Human-readable meaning of `computeDesiredTriageStateLabel` / JSON `triage_state_key` (for console + summary). */
export const TRIAGE_STATE_KEY_HUMAN = {
  merge_conflict: "Merge conflicts with the base branch",
  merge_state_unknown: "Merge status not resolved yet (GitHub)",
  ci_failing: "One or more CI checks failed",
  ci_in_progress: "CI still queued or running",
  ci_missing: "No check runs on the current commit",
  insufficient_success: "Not enough green checks vs configured minimum",
  gemini:
    "GitHub still reports unresolved Gemini threads (API); triage-blocking unless waived by label or Claude attestation",
  workflow_approval: "GitHub Actions waiting for workflow approval",
  ready: "No scripted triage blockers; ready for human review",
  needs_attention: "Triage ping recommended (see checks / comments)",
  none: "No triage state label (nothing in scope for this bot)",
};

/** Hidden marker so we do not spam duplicate triage comments on reruns. */
export const TRIAGE_COMMENT_MARKER = "<!-- pr-ci-gemini-triage -->";

export const REVIEW_THREADS_QUERY = `
query ($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          isResolved
          isOutdated
          path
          comments(first: 50) {
            nodes { author { login } body }
          }
        }
      }
    }
  }
}
`;

/** Resolves MERGEABLE / CONFLICTING / UNKNOWN when REST leaves mergeable null (see refreshPullMergeStatus). */
export const MERGE_STATE_QUERY = `
query ($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      mergeable
      mergeStateStatus
    }
  }
}
`;

export const LOCAL_CLAUDE_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Tools auto-allowed when `claude -p` is invoked to resolve a merge conflict in an
 * isolated worktree. Edits + git plumbing for staging/committing/pushing, plus a
 * narrow set of build/lint commands so claude can sanity-check the resolution.
 */
export const LOCAL_CLAUDE_ALLOWED_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "Grep",
  "Glob",
  "Bash(git status:*)",
  "Bash(git diff:*)",
  "Bash(git add:*)",
  "Bash(git restore:*)",
  "Bash(git checkout:*)",
  "Bash(git commit:*)",
  "Bash(git push:*)",
  "Bash(git log:*)",
  "Bash(git show:*)",
  "Bash(git rev-parse:*)",
  "Bash(git branch:*)",
  "Bash(git ls-files:*)",
  "Bash(npm run lint:*)",
  "Bash(npm run build:*)",
  "Bash(npm run typecheck:*)",
  "Bash(npx tsc:*)",
];

/** Only open orphan PRs when the branch's first unique commit (vs base) is within this window. */
export const ORPHAN_PR_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Workflow run `status` values while a run is still in-flight before completion.
 * (Rarely, the API may surface `action_required` as a status — see GitHub REST enum.)
 */
export const FORK_WORKFLOW_WAIT_STATUSES = new Set([
  "waiting",
  "pending",
  "requested",
  "action_required",
]);

/** True while a Actions run for `.github/workflows/claude.yml` is still running on this SHA. */
export const WORKFLOW_RUN_ACTIVE_STATUSES = new Set([
  "queued",
  "in_progress",
  "waiting",
  "pending",
  "requested",
]);

export const CI_RETRIGGER_COMMIT_MESSAGE = "chore(ci): retrigger workflows (pr-claude-triage)";

export const TRIAGE_LABEL_DESCRIPTIONS = {
  mergeConflict: "Merge conflicts with the base branch (pr-claude-triage)",
  mergeStateUnknown: "GitHub mergeable state not resolved yet (pr-claude-triage)",
  ciFailing: "One or more check runs failed (pr-claude-triage)",
  insufficientSuccess: "Not enough successful (green) check runs vs configured minimum (pr-claude-triage)",
  geminiReview:
    "API reports unresolved Gemini inline threads; not waived by all-gemini label or Claude attestation (pr-claude-triage)",
  workflowApproval: "GitHub Actions runs awaiting maintainer approval (pr-claude-triage)",
  ciMissing: "No check runs on the current head (pr-claude-triage)",
  ciInProgress: "CI still queued or running (pr-claude-triage)",
  ready: "No triage blockers; ready for human review (pr-claude-triage)",
  needsAttention: "Triage automation flagged this PR; see comments or checks (pr-claude-triage)",
};
