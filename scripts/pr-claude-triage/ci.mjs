import process from "node:process";

import {
  API_VERSION,
  CI_RETRIGGER_COMMIT_MESSAGE,
  FORK_WORKFLOW_WAIT_STATUSES,
} from "./constants.mjs";
import { originRemoteMatchesRepository, pushEmptyCommitForCiRetriggerWithLocalGit } from "./git-local.mjs";
import {
  fetchCheckRunsForSha,
  getToken,
  githubRest,
  githubRestPatch,
  githubRestPost,
  githubRestPostStatus,
  listWorkflowRunsForHeadSha,
} from "./github.mjs";
import { hasMergeConflict } from "./merge-state.mjs";

/**
 * True when this run is blocked on "Approve workflows to run" (or equivalent).
 *
 * GitHub often represents the maintainer-approval gate as **`completed` + `conclusion: action_required`**
 * (see real PRs: CI / client-type-check runs finish immediately with that conclusion until someone
 * clicks **Approve workflows**). Older code only looked at `status` ∈ {waiting, pending, requested},
 * which misses that case entirely.
 *
 * Also counts `queued` runs with no start time (fork / contributor gate before any job starts).
 */
function isAwaitingForkWorkflowApproval(run) {
  if (!run) return false;
  const st = run.status;
  if (FORK_WORKFLOW_WAIT_STATUSES.has(st)) return true;
  if (st === "completed" && run.conclusion === "action_required") {
    return true;
  }
  const conclusion = run.conclusion;
  const noConclusion = conclusion == null || conclusion === "";
  if (st === "queued" && noConclusion && !run.run_started_at) {
    return true;
  }
  return false;
}

/**
 * POST /repos/{owner}/{repo}/actions/runs/{run_id}/approve — primarily **public fork** + first-time
 * contributor workflow runs (GitHub docs). Often returns **403** on private repos or same-repo bot PRs.
 * @returns {{ ok: true } | { ok: false, status: number, body: string }}
 */
async function postApproveWorkflowRun(owner, repo, runId) {
  const token = getToken();
  const path = `/repos/${owner}/${repo}/actions/runs/${runId}/approve`;
  const res = await fetch(`https://api.github.com${path}`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
    },
  });
  const text = await res.text();
  if (res.status === 201 || res.status === 200) {
    return { ok: true };
  }
  return { ok: false, status: res.status, body: text.slice(0, 800) };
}

async function fetchPendingDeploymentsForRun(owner, repo, runId) {
  try {
    const data = await githubRest(
      `/repos/${owner}/${repo}/actions/runs/${runId}/pending_deployments`,
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Same tree + parent as tip → empty commit, then move branch ref — retriggers Actions when UI approve is unavailable.
 * @returns {Promise<
 *   | { ok: true, new_head_sha: string, previous_sha: string, via: "api" }
 *   | { ok: false, detail: string }
 * >}
 */
async function pushEmptyCommitForCiRetriggerViaApi(owner, repo, branchName) {
  try {
    const refPath = `heads/${branchName}`;
    const refEnc = encodeURIComponent(refPath);
    const refData = await githubRest(`/repos/${owner}/${repo}/git/ref/${refEnc}`);
    const currentSha = refData.object?.sha;
    if (!currentSha || typeof currentSha !== "string") {
      return { ok: false, detail: "Could not read branch ref SHA" };
    }

    const commitObj = await githubRest(`/repos/${owner}/${repo}/git/commits/${currentSha}`);
    const treeSha = commitObj.tree?.sha;
    if (!treeSha) {
      return { ok: false, detail: "Could not read commit tree" };
    }

    const newCommit = await githubRestPost(`/repos/${owner}/${repo}/git/commits`, {
      message: CI_RETRIGGER_COMMIT_MESSAGE,
      tree: treeSha,
      parents: [currentSha],
    });

    const newSha = newCommit?.sha;
    if (!newSha || typeof newSha !== "string") {
      return { ok: false, detail: "Create commit returned no sha" };
    }

    await githubRestPatch(`/repos/${owner}/${repo}/git/refs/${refEnc}`, {
      sha: newSha,
      force: false,
    });

    return { ok: true, new_head_sha: newSha, previous_sha: currentSha, via: "api" };
  } catch (e) {
    return { ok: false, detail: (e.message || String(e)).slice(0, 600) };
  }
}

/**
 * Optional local `git` path (PR_TRIAGE_USE_LOCAL_GIT) runs `commit --allow-empty` + `push`, then `git checkout -`.
 * Falls back to the Git Data API if local push fails or is not chosen.
 * @param {{ preferLocalGit?: boolean, gitCwd?: string }} [opts]
 */
async function pushEmptyCommitForCiRetrigger(owner, repo, branchName, opts) {
  const prefer =
    Boolean(opts?.preferLocalGit) &&
    typeof opts?.gitCwd === "string" &&
    opts.gitCwd.length > 0 &&
    originRemoteMatchesRepository(opts.gitCwd, owner, repo);
  if (prefer) {
    const local = await pushEmptyCommitForCiRetriggerWithLocalGit(
      opts.gitCwd,
      branchName,
      CI_RETRIGGER_COMMIT_MESSAGE,
    );
    if (local.ok) {
      return local;
    }
  }
  return pushEmptyCommitForCiRetriggerViaApi(owner, repo, branchName);
}

/**
 * Try fork-style approve, then approve **environment** pending deployments (same repo / protected envs).
 */
async function tryApproveWorkflowRun(owner, repo, run) {
  const fork = await postApproveWorkflowRun(owner, repo, run.id);
  if (fork.ok) {
    return { ok: true, via: "approve_endpoint" };
  }

  const pending = await fetchPendingDeploymentsForRun(owner, repo, run.id);
  const approvable = pending.filter(
    (p) => p.current_user_can_approve === true && p.environment?.id != null,
  );
  if (approvable.length === 0) {
    return {
      ok: false,
      via: "none",
      status: fork.status,
      detail: fork.body ?? "",
    };
  }

  const environment_ids = approvable.map((p) => p.environment.id);
  const { ok, status, text } = await githubRestPostStatus(
    `/repos/${owner}/${repo}/actions/runs/${run.id}/pending_deployments`,
    {
      environment_ids,
      state: "approved",
      comment: "Approved via pr-claude-triage",
    },
  );
  if (ok) {
    return { ok: true, via: "pending_deployments" };
  }
  return {
    ok: false,
    via: "pending_deployments_failed",
    status,
    detail: text?.slice(0, 800) ?? "",
  };
}

/**
 * Approves workflow runs where the API allows; if runs are still blocked (e.g. private repo), pushes an
 * **empty git commit** on `headBranchName` to re-trigger CI (same tree as tip).
 */
export async function processForkWorkflowApprovals(owner, repo, headSha, headBranchName, options) {
  const { dryRun, disabled, noEmptyCommitRetrigger, preferLocalGitForEmptyRetrigger, gitCwd } = options;

  let runs = await listWorkflowRunsForHeadSha(owner, repo, headSha);
  let awaiting = runs.filter(isAwaitingForkWorkflowApproval);
  const before = awaiting.length;

  if (disabled) {
    return {
      workflows_awaiting_approval_before: before,
      workflows_awaiting_approval_after: before,
      workflows_approved_run_ids: [],
      workflows_approve_errors: [],
      workflows_approval_skipped: true,
      workflows_empty_commit_retrigger: null,
      workflows_effective_head_sha: headSha,
    };
  }

  if (before === 0) {
    return {
      workflows_awaiting_approval_before: 0,
      workflows_awaiting_approval_after: 0,
      workflows_approved_run_ids: [],
      workflows_approve_errors: [],
      workflows_approval_skipped: false,
      workflows_empty_commit_retrigger: null,
      workflows_effective_head_sha: headSha,
    };
  }

  const canEmptyRetrigger =
    typeof headBranchName === "string" &&
    headBranchName.length > 0 &&
    !noEmptyCommitRetrigger;

  if (dryRun) {
    return {
      workflows_awaiting_approval_before: before,
      workflows_awaiting_approval_after: before,
      workflows_approved_run_ids: [],
      workflows_approve_errors: [],
      workflows_approval_skipped: false,
      workflows_would_approve_run_ids: awaiting.map((r) => r.id),
      workflows_would_empty_commit_retrigger: before > 0 && canEmptyRetrigger,
      workflows_would_prefer_local_git:
        before > 0 && canEmptyRetrigger && Boolean(preferLocalGitForEmptyRetrigger),
      workflows_empty_commit_retrigger: null,
      workflows_effective_head_sha: headSha,
    };
  }

  const approvedRunIds = [];
  const errors = [];

  for (const run of awaiting) {
    const result = await tryApproveWorkflowRun(owner, repo, run);
    if (result.ok) {
      approvedRunIds.push(run.id);
    } else {
      errors.push({
        run_id: run.id,
        status: result.status,
        detail: result.detail,
        via: result.via,
        workflow_path: run.path ?? null,
      });
    }
  }

  let effectiveHeadSha = headSha;
  runs = await listWorkflowRunsForHeadSha(owner, repo, effectiveHeadSha);
  awaiting = runs.filter(isAwaitingForkWorkflowApproval);
  let after = awaiting.length;

  /** @type {null | { ok: true, new_head_sha: string, previous_sha: string, via?: string } | { ok: false, detail: string }} */
  let emptyRetrigger = null;

  if (after > 0 && canEmptyRetrigger) {
    emptyRetrigger = await pushEmptyCommitForCiRetrigger(owner, repo, headBranchName, {
      preferLocalGit: Boolean(preferLocalGitForEmptyRetrigger),
      gitCwd: typeof gitCwd === "string" ? gitCwd : undefined,
    });
    if (emptyRetrigger.ok) {
      effectiveHeadSha = emptyRetrigger.new_head_sha;
      runs = await listWorkflowRunsForHeadSha(owner, repo, effectiveHeadSha);
      awaiting = runs.filter(isAwaitingForkWorkflowApproval);
      after = awaiting.length;
    }
  }

  return {
    workflows_awaiting_approval_before: before,
    workflows_awaiting_approval_after: after,
    workflows_approved_run_ids: approvedRunIds,
    workflows_approve_errors: errors,
    workflows_approval_skipped: false,
    workflows_empty_commit_retrigger: emptyRetrigger,
    workflows_effective_head_sha: effectiveHeadSha,
  };
}

export function summarizeCheckRuns(checkRuns) {
  let total = 0;
  let completedOk = 0;
  let completedFail = 0;
  let skipped = 0;
  let cancelled = 0;
  let queuedOrRunning = 0;

  for (const run of checkRuns) {
    total += 1;
    const { status, conclusion } = run;
    if (
      status === "queued" ||
      status === "in_progress" ||
      status === "waiting" ||
      status === "pending" ||
      status === "requested"
    ) {
      queuedOrRunning += 1;
      continue;
    }
    if (status === "completed") {
      if (conclusion === "success") completedOk += 1;
      else if (conclusion === "failure") completedFail += 1;
      else if (conclusion === "skipped") skipped += 1;
      else if (conclusion === "cancelled") cancelled += 1;
      else if (conclusion === "timed_out" || conclusion === "action_required") completedFail += 1;
    }
  }

  const hasCi = total > 0;
  const failures = completedFail;

  return {
    check_runs: total,
    completed_ok: completedOk,
    completed_fail: completedFail,
    skipped,
    cancelled,
    queued_or_running: queuedOrRunning,
    has_ci: hasCi,
    failures,
  };
}

/**
 * @returns {number} 0 = do not enforce a minimum count of green check runs
 */
export function getMinRequiredPassedCheckRuns() {
  const n = parseInt(String(process.env.PR_TRIAGE_MIN_PASSED_CHECKS ?? "7"), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * @returns {number} 0 = do not auto-push the stalled-head empty commit; otherwise push when `check_runs` is **strictly below** this.
 */
export function getCheckRunCountFloorForAutoEmptyCommit() {
  const n = parseInt(
    String(process.env.PR_TRIAGE_AUTO_EMPTY_COMMIT_WHEN_CHECK_RUNS_BELOW ?? "5"),
    10,
  );
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * `completed_ok` is below the configured floor while CI is finished (no in-flight, no red checks).
 * We do **not** use `mergeable_state` here: "blocked" often just means a human review is required, while
 * the PR is still in a *ready for review* state. Zero check runs is left to the `ci_missing` label instead.
 * @param {Record<string, unknown>} row
 */
export function hasInsufficientCompletedSuccessCount(row) {
  const min = getMinRequiredPassedCheckRuns();
  if (min <= 0) return false;
  if ((row.check_runs ?? 0) < 1) return false;
  if ((row.queued_or_running ?? 0) > 0) return false;
  if ((row.failures ?? 0) > 0) return false;
  return (row.completed_ok ?? 0) < min;
}

/**
 * @param {string | null | undefined} message
 * @returns {boolean}
 */
function isEmptyCiRetriggerCommitMessage(message) {
  if (message == null) return false;
  const m = String(message).trim();
  return m === CI_RETRIGGER_COMMIT_MESSAGE;
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} sha
 * @returns {Promise<string | null>}
 */
async function fetchCommitMessageForSha(owner, repo, sha) {
  if (!sha) return null;
  const data = await githubRest(
    `/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}`,
  );
  const msg = data?.commit?.message;
  return msg != null ? String(msg) : null;
}

/**
 * If the check-run **row count** on the head is below `PR_TRIAGE_AUTO_EMPTY_COMMIT_WHEN_CHECK_RUNS_BELOW` (default 5)
 * and nothing is busy, push an empty commit to seed/re-run CI (same as workflow-approval retrigger), unless
 * the tip is already the triage empty commit. Path/`if` skips are not fixed by a second empty commit.
 * @param {{
 *   owner: string,
 *   repo: string,
 *   headRef: string,
 *   headSha: string,
 *   checkRuns: unknown[],
 *   ci: { check_runs: number, completed_ok: number, completed_fail: number, skipped: number, cancelled: number, queued_or_running: number, has_ci: boolean, failures: number },
 *   prMerge: Record<string, unknown>,
 *   dryRun: boolean,
 *   noEmptyCommitRetrigger: boolean,
 *   preferLocalGitForEmptyRetrigger: boolean,
 *   gitCwd: string,
 *   workflowEmptyRetriggerOk: boolean,
 * }} args
 */
export async function maybeRetriggerCiStalledHeadEmptyCommit(args) {
  const {
    owner,
    repo,
    headRef,
    headSha,
    checkRuns,
    ci,
    prMerge,
    dryRun,
    noEmptyCommitRetrigger,
    preferLocalGitForEmptyRetrigger,
    gitCwd,
    workflowEmptyRetriggerOk,
  } = args;

  const minBelow = getCheckRunCountFloorForAutoEmptyCommit();

  const empty = (extra) => ({
    headSha,
    checkRuns,
    ci,
    stalled_head_empty_commit_retrigger: extra,
  });

  const skip = (reason) => empty({ skipped: true, reason });

  if (minBelow === 0) {
    return empty(null);
  }
  if (noEmptyCommitRetrigger) {
    return skip("no_empty_commit_retrigger");
  }
  if (!headRef || String(headRef).length === 0) {
    return skip("no_head_ref");
  }
  if (workflowEmptyRetriggerOk) {
    return skip("workflow_empty_commit_already_pushed");
  }
  if (hasMergeConflict(prMerge)) {
    return skip("merge_conflict");
  }
  if ((ci.check_runs ?? 0) >= minBelow) {
    return empty(null);
  }
  if ((ci.queued_or_running ?? 0) > 0) {
    return skip("queued_or_in_progress");
  }
  if ((ci.failures ?? 0) > 0) {
    return skip("check_failures");
  }

  let tipMsg;
  try {
    tipMsg = await fetchCommitMessageForSha(owner, repo, headSha);
  } catch {
    return skip("commit_message_fetch_failed");
  }
  if (isEmptyCiRetriggerCommitMessage(tipMsg)) {
    return skip("tip_already_retrigger_empty_commit");
  }

  if (dryRun) {
    return {
      headSha,
      checkRuns,
      ci,
      stalled_head_empty_commit_retrigger: {
        dry_run: true,
        would: true,
        reason: "stalled_head_retrigger",
        min_check_runs_to_skip_auto: minBelow,
        have_check_runs: ci.check_runs ?? 0,
      },
    };
  }

  const r = await pushEmptyCommitForCiRetrigger(owner, repo, headRef, {
    preferLocalGit: Boolean(preferLocalGitForEmptyRetrigger),
    gitCwd: typeof gitCwd === "string" ? gitCwd : undefined,
  });
  if (!r.ok) {
    return {
      headSha,
      checkRuns,
      ci,
      stalled_head_empty_commit_retrigger: { ok: false, detail: r.detail, reason: "stalled_head_retrigger" },
    };
  }
  const newSha = r.new_head_sha;
  const newRuns = await fetchCheckRunsForSha(owner, repo, newSha);
  const newCi = summarizeCheckRuns(newRuns);
  return {
    headSha: newSha,
    checkRuns: newRuns,
    ci: newCi,
    stalled_head_empty_commit_retrigger: { ...r, reason: "stalled_head_retrigger" },
  };
}

