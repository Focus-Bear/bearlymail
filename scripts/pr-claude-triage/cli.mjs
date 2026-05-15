import process from "node:process";

import {
  getCheckRunCountFloorForAutoEmptyCommit,
  getMinRequiredPassedCheckRuns,
  hasInsufficientCompletedSuccessCount,
  maybeRetriggerCiStalledHeadEmptyCommit,
  processForkWorkflowApprovals,
  summarizeCheckRuns,
} from "./ci.mjs";
import {
  localConflictResolutionTookOver,
  maybeResolveConflictWithLocalClaude,
} from "./conflict-resolver.mjs";
import {
  localCiResolutionTookOver,
  maybeResolveCiFailuresWithLocalClaude,
} from "./ci-failure-resolver.mjs";
import {
  localGeminiResolutionTookOver,
  maybeResolveGeminiFeedbackWithLocalClaude,
} from "./gemini-feedback-resolver.mjs";
import {
  consumeResultFile,
  getMaxConcurrentResolvers,
  listActiveResolvers,
} from "./resolver-lock.mjs";
import {
  DEFAULT_GEMINI_CLAUDE_ATTESTATION_SUBSTRING,
  DEFAULT_REPO,
} from "./constants.mjs";
import {
  fetchUnresolvedGeminiThreads,
  geminiBotSet,
  geminiUnresolvedBlocksTriage,
  geminiWaivedByLatestClaudeIssueComment,
  getGeminiActionedLabel,
  getGeminiClaudeAttestationSubstring,
  prHasGeminiActionedLabel,
} from "./gemini.mjs";
import {
  ensureGithubTokenFromGhCli,
  fetchCheckRunsForSha,
  fetchIssueComments,
  listOpenPulls,
} from "./github.mjs";
import {
  isInsideGitWorkTree,
  originRemoteMatchesRepository,
  shouldUseLocalGitForRetrigger,
} from "./git-local.mjs";
import { hasMergeConflict, mergeableStateIsBlockingGates, refreshPullMergeStatus } from "./merge-state.mjs";
import {
  createPullRequestsForOrphanBranches,
  fetchRepositoryDefaultBranch,
  findOrphanClaudeBranches,
  listClaudeGitRefs,
} from "./orphan-branches.mjs";
import { createEmptySummary, formatUnknown, printConsoleSummary } from "./summary.mjs";
import {
  claudeTriagePingRecommended,
  computeDesiredTriageStateLabel,
  describeNoBotPingReason,
  formatDecisionLine,
  getAllManagedTriageLabelNames,
  getTriageStateLabelConfig,
  maybePostTriageComment,
  syncTriageStateLabels,
  triagePingRecommended,
  triageStateKeyHumanSentence,
} from "./triage-state.mjs";

export function parseArgs(argv) {
  const out = {
    json: false,
    repo: process.env.GITHUB_REPOSITORY || DEFAULT_REPO,
    prFilter: null,
    failOnGeminiUnresolved: false,
    failOnTriagePing: false,
    dryRun: false,
    forceComment: false,
    noApproveWorkflows: false,
    noCreateOrphanPrs: false,
    noEmptyCommitRetrigger: false,
    noReadyForReviewLabel: false,
    noTriageStateLabels: false,
    noLocalResolvers: false,
    deleteMergedClaudeBranches: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--fail-on-gemini-unresolved") out.failOnGeminiUnresolved = true;
    else if (a === "--fail-on-triage-ping") out.failOnTriagePing = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--force-comment") out.forceComment = true;
    else if (a === "--no-approve-workflows") out.noApproveWorkflows = true;
    else if (a === "--no-create-orphan-prs") out.noCreateOrphanPrs = true;
    else if (a === "--no-empty-commit-retrigger") out.noEmptyCommitRetrigger = true;
    else if (a === "--no-ready-for-review-label") out.noReadyForReviewLabel = true;
    else if (a === "--no-triage-state-labels") out.noTriageStateLabels = true;
    else if (a === "--no-local-resolvers") out.noLocalResolvers = true;
    else if (a === "--delete-merged-claude-branches") out.deleteMergedClaudeBranches = true;
    else if (a === "-h" || a === "--help") out.help = true;
    else if (a === "-R" || a === "--repo") {
      out.repo = argv[++i];
      if (!out.repo) throw new Error("Missing value for --repo");
    } else if (a === "--pr") {
      const n = argv[++i];
      if (!n || !/^\d+$/.test(n)) throw new Error("--pr requires a positive integer");
      out.prFilter = parseInt(n, 10);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return out;
}

export async function main() {
  ensureGithubTokenFromGhCli();
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`
Usage: node scripts/pr-claude-triage.mjs [options]

Options:
  --json                         Output JSON (includes orphan_claude_pr_creation when run)
  -R, --repo OWNER/REPO          Repository (default: GITHUB_REPOSITORY or ${DEFAULT_REPO})
  --pr N                         Only process PR #N
  --fail-on-gemini-unresolved    Exit 2 if any PR still has triage-blocking Gemini threads (the all-gemini-feedback-actioned label waives; see GEMINI_ACTIONED_LABEL)
  --fail-on-triage-ping          Exit 2 if any PR recommends a triage ping (CI, merge, min green checks, conflict, or Gemini, etc.)
  --dry-run                      Do not post comments, approve workflows, push empty commits, open orphan PRs, or delete remote branches
  --force-comment                Post even if a Claude workflow is still running (overrides duplicate skip)
  --no-approve-workflows         Do not POST workflow approvals (still counts runs awaiting approval)
  --no-empty-commit-retrigger    Do not push an empty commit to re-trigger CI (workflow, stalled-head, or any path)
  --no-triage-state-labels      Do not sync triage/* state labels (see PR_TRIAGE_STATE_LABELS)
  --no-ready-for-review-label   Do not use the "ready" slot (others still apply if triage labels are on)
  --no-local-resolvers          Disable local \`claude -p\` resolvers (CI failures + Gemini); fall back to @claude github comment for everything
  --no-create-orphan-prs         List orphan claude/* branches only; do not open PRs for them
  --delete-merged-claude-branches  When orphan PR is skipped (already merged / already in base), delete the remote claude/* branch
  -h, --help                     This help

Default: approves workflow runs where the API allows; if runs stay blocked on the same SHA, pushes an
empty git commit on the PR branch to re-trigger CI. Then rolls up CI. Opens PRs
for orphan claude/* branches when the branch's first commit vs the base is within 7 days; PR title is
#N plus issue title when the branch is claude/issue-N-*. Base = default branch (PR_TRIAGE_BASE_BRANCH).
Posts @claude triage comments for CI / Gemini (not for “too few check run rows” — the script auto-pushes an empty commit). Merge conflicts are routed to a local \`claude -p\` session in an isolated worktree when a usable local clone with matching origin and the \`claude\` CLI are available; falls back to the @claude github ping otherwise. Token: **Contents** (write, for empty commits), **Actions** (read/write), **Pull requests**, **Issues**.

Environment:
  GITHUB_TOKEN or GH_TOKEN
  PR_TRIAGE_BASE_BRANCH   Base branch for orphan claude/* PRs (default: repo default branch from API)
  PR_TRIAGE_USE_LOCAL_GIT  "1"/"true": use local git in PR_TRIAGE_GIT_CWD (or cwd) for empty CI retrigger
  PR_TRIAGE_GIT_CWD        Repo root for PR_TRIAGE_USE_LOCAL_GIT (default: process cwd; origin must match -R)
  PR_TRIAGE_STATE_LABELS   If empty: disable triage label syncing. Unset: enabled — clears this script's labels on each PR first, then applies one matching label (priority order)
  PR_TRIAGE_MIN_PASSED_CHECKS  Minimum *completed success* check runs to treat the rollup as green (default: 7; 0 = off)
  PR_TRIAGE_AUTO_EMPTY_COMMIT_WHEN_CHECK_RUNS_BELOW  If head has **fewer** than this many check *run rows* (default: 5) and
                            CI is not busy, push the automated empty commit; 0 = never
  PR_TRIAGE_LABEL_*        Optional overrides: MERGE_CONFLICT, MERGE_STATE_UNKNOWN, CI_FAILING,
                            INSUFFICIENT_SUCCESS, GEMINI_REVIEW, WORKFLOW_APPROVAL, CI_MISSING, CI_IN_PROGRESS, NEEDS_ATTENTION
                            (empty = disable that slot)
  PR_TRIAGE_READY_FOR_REVIEW_LABEL  "Ready" state label; unset=ready-for-review; empty=disable that slot
  GEMINI_REVIEW_BOTS      comma-separated logins (default: gemini-code-assist)
  GEMINI_ACTIONED_LABEL   PR label name that means Gemini is fully addressed; unset = "all-gemini-feedback-actioned", empty = disable
  GEMINI_CLAUDE_ATTESTATION_SUBSTRING  substring the latest Claude issue comment must contain to waive Gemini API threads;
                            unset = "${DEFAULT_GEMINI_CLAUDE_ATTESTATION_SUBSTRING}" (case-insensitive); empty = disable waiver
  CLAUDE_ISSUE_COMMENT_BOTS  comma-separated issue-comment logins counted as Claude (default: github-actions,github-actions[bot])
`);
    process.exit(0);
  }

  const [owner, repo] = args.repo.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repo slug: ${args.repo} (expected owner/repo)`);
  }

  const gitCwd = (process.env.PR_TRIAGE_GIT_CWD || "").trim() || process.cwd();
  const preferLocalGitForEmptyRetrigger =
    shouldUseLocalGitForRetrigger() &&
    isInsideGitWorkTree(gitCwd) &&
    originRemoteMatchesRepository(gitCwd, owner, repo);
  const triageLabelConfig = getTriageStateLabelConfig(args);
  const managedTriageLabelNames = triageLabelConfig
    ? getAllManagedTriageLabelNames(triageLabelConfig)
    : [];

  const bots = geminiBotSet();

  // Cleans stale lockfiles + worktrees from prior crashed runs and prints what's still live.
  if (!args.json) {
    const live = listActiveResolvers(gitCwd);
    const cap = getMaxConcurrentResolvers();
    if (live.length > 0) {
      console.log(
        `[resolvers] ${live.length}/${cap} active local resolver(s) on this machine: ${live
          .map((l) => `${l.kind}#${l.prNumber}(pid ${l.pid})`)
          .join(", ")}`,
      );
      console.log("");
    } else {
      console.log(`[resolvers] 0/${cap} active local resolver(s) on this machine`);
      console.log("");
    }
  }

  const allOpenPulls = await listOpenPulls(owner, repo);
  const openHeadRefs = new Set(
    allOpenPulls.map((p) => p.head?.ref).filter((r) => typeof r === "string"),
  );
  let pulls = allOpenPulls;
  if (args.prFilter != null) {
    pulls = pulls.filter((p) => p.number === args.prFilter);
  }

  const results = [];
  const summary = createEmptySummary();

  for (const pr of pulls) {
    let headSha = pr.head?.sha;
    if (!headSha) continue;

    const prMerge = await refreshPullMergeStatus(owner, repo, pr);
    const headRef = prMerge.head?.ref ?? "";

    const geminiFeedbackActionedFromIssue = prHasGeminiActionedLabel(prMerge);

    let checkRuns = await fetchCheckRunsForSha(owner, repo, headSha);
    let ci = summarizeCheckRuns(checkRuns);
    const checksInProgress = (ci.queued_or_running ?? 0) > 0;

    const wfResult = await processForkWorkflowApprovals(owner, repo, headSha, headRef, {
      dryRun: args.dryRun,
      disabled: args.noApproveWorkflows || checksInProgress,
      noEmptyCommitRetrigger: args.noEmptyCommitRetrigger || checksInProgress,
      preferLocalGitForEmptyRetrigger,
      gitCwd,
    });

    if (typeof wfResult.workflows_effective_head_sha === "string") {
      headSha = wfResult.workflows_effective_head_sha;
    }

    if (!checksInProgress) {
      checkRuns = await fetchCheckRunsForSha(owner, repo, headSha);
      ci = summarizeCheckRuns(checkRuns);
    }
    const workflowEmptyRetriggerOk = wfResult.workflows_empty_commit_retrigger?.ok === true;
    const stalledEmptyResult = await maybeRetriggerCiStalledHeadEmptyCommit({
      owner,
      repo,
      headRef,
      headSha,
      checkRuns,
      ci,
      prMerge,
      dryRun: args.dryRun,
      noEmptyCommitRetrigger: args.noEmptyCommitRetrigger,
      preferLocalGitForEmptyRetrigger,
      gitCwd,
      workflowEmptyRetriggerOk,
    });
    headSha = stalledEmptyResult.headSha;
    ci = stalledEmptyResult.ci;
    const gemini = await fetchUnresolvedGeminiThreads(owner, repo, prMerge.number, bots);
    const issueCommentsForAttestation = await fetchIssueComments(owner, repo, prMerge.number);
    const gemini_claude_attestation_present =
      geminiWaivedByLatestClaudeIssueComment(issueCommentsForAttestation);
    const actionedLabel = getGeminiActionedLabel();

    const row = {
      number: prMerge.number,
      title: prMerge.title,
      branch: prMerge.head?.ref ?? null,
      url: prMerge.html_url,
      mergeable: prMerge.mergeable,
      mergeable_state: prMerge.mergeable_state ?? null,
      mergeability_indeterminate: prMerge.mergeability_indeterminate === true,
      pr_triage_min_passed_checks: getMinRequiredPassedCheckRuns(),
      pr_triage_auto_empty_commit_min_check_runs: getCheckRunCountFloorForAutoEmptyCommit(),
      /** True on the pre-workflow read: we did not approve workflows or empty-commit retrigger that run. */
      triage_waits_on_check_runs: checksInProgress,
      ...wfResult,
      ...ci,
      stalled_head_empty_commit_retrigger: stalledEmptyResult.stalled_head_empty_commit_retrigger,
      conflict: hasMergeConflict(prMerge) ? 1 : 0,
      ci_missing: ci.check_runs === 0 ? 1 : 0,
      ...gemini,
      gemini_feedback_actioned_label: actionedLabel,
      gemini_feedback_actioned_label_set: geminiFeedbackActionedFromIssue,
      gemini_claude_attestation_substring: getGeminiClaudeAttestationSubstring(),
      gemini_claude_attestation_present,
    };

    // 1. Consume any completed-resolver result from a prior tick (the runner wrote it then exited).
    const completedFromPriorTick = consumeResultFile(gitCwd, prMerge.number);
    if (completedFromPriorTick && !args.json) {
      const r = completedFromPriorTick;
      console.log(
        `  local ${r.kind} resolver completed (prior tick): ${r.action}${r.detail ? ` — ${r.detail.slice(0, 240)}` : ""}${
          typeof r.threads_resolved === "number" ? ` (${r.threads_resolved} thread(s) Resolved)` : ""
        }`,
      );
    }
    row.local_resolver_completed_prior_tick = completedFromPriorTick;

    // 2. Check if a resolver is currently in flight for this PR (lockfile alive from earlier tick).
    const liveResolvers = listActiveResolvers(gitCwd);
    const inFlightForPr = liveResolvers.find((l) => l.prNumber === prMerge.number) ?? null;
    if (inFlightForPr && !args.json) {
      console.log(
        `  local ${inFlightForPr.kind} resolver in flight: pid ${inFlightForPr.pid}, started ${inFlightForPr.startedAt}`,
      );
    }
    row.local_resolver_in_flight = inFlightForPr;

    // 3. Decide which (if any) NEW resolver to spawn this tick. Priority: conflict > CI > Gemini.
    //    Always spawn detached — `maybeResolve*WithLocalClaude` returns `started_in_background`
    //    immediately and the runner child writes `.result-pr-N.json` when it finishes.
    row.local_conflict_resolution = { ok: false, action: "no_conflict" };
    row.local_ci_resolution = { ok: false, action: "no_failures" };
    row.local_gemini_resolution = { ok: false, action: "no_unresolved_threads" };

    if (!args.noLocalResolvers && !inFlightForPr) {
      if (row.conflict === 1) {
        if (!args.json) {
          console.log(
            `PR #${prMerge.number}: merge conflict detected — spawning detached conflict resolver...`,
          );
        }
        row.local_conflict_resolution = await maybeResolveConflictWithLocalClaude(
          owner,
          repo,
          prMerge,
          gitCwd,
          { dryRun: args.dryRun },
        );
        if (!args.json) {
          const r = row.local_conflict_resolution;
          const status = r.ok ? "spawned" : "skipped";
          console.log(`  local conflict resolver ${status}: ${r.action}${r.detail ? ` — ${r.detail.slice(0, 240)}` : ""}`);
        }
      }

      // CI: only fire if conflict didn't just claim the per-PR lock this tick. (The conflict
      // resolver releases on spawn-failure; on spawn-success the lock is held by the child.)
      if (
        !localConflictResolutionTookOver(row) &&
        row.local_conflict_resolution.action !== "started_in_background" &&
        (row.failures ?? 0) > 0
      ) {
        if (!args.json) {
          console.log(
            `PR #${prMerge.number}: ${row.failures} CI failure(s) — spawning detached CI resolver...`,
          );
        }
        row.local_ci_resolution = await maybeResolveCiFailuresWithLocalClaude(
          owner,
          repo,
          prMerge,
          gitCwd,
          checkRuns,
          { dryRun: args.dryRun },
        );
        if (!args.json) {
          const r = row.local_ci_resolution;
          const status = r.ok ? "spawned" : "skipped";
          console.log(`  local CI resolver ${status}: ${r.action}${r.detail ? ` — ${r.detail.slice(0, 240)}` : ""}`);
        }
      }

      // Gemini: same constraint — defer if any earlier resolver this tick claimed the per-PR lock.
      if (
        row.local_conflict_resolution.action !== "started_in_background" &&
        row.local_ci_resolution.action !== "started_in_background" &&
        geminiUnresolvedBlocksTriage(row)
      ) {
        if (!args.json) {
          console.log(
            `PR #${prMerge.number}: ${row.gemini_unresolved_count} unresolved Gemini thread(s) — spawning detached Gemini resolver...`,
          );
        }
        row.local_gemini_resolution = await maybeResolveGeminiFeedbackWithLocalClaude(
          owner,
          repo,
          prMerge,
          gitCwd,
          bots,
          { dryRun: args.dryRun },
        );
        if (!args.json) {
          const r = row.local_gemini_resolution;
          const status = r.ok ? "spawned" : "skipped";
          const threadHint = typeof r.pending_threads === "number" ? ` (${r.pending_threads} threads queued)` : "";
          console.log(`  local Gemini resolver ${status}: ${r.action}${r.detail ? ` — ${r.detail.slice(0, 240)}` : ""}${threadHint}`);
        }
      }
    }

    const ping = triagePingRecommended(row);
    row.triage_ping_recommended = ping.triage_ping_recommended;
    row.triage_ping_reasons = ping.triage_ping_reasons;
    row.claude_triage_ping_recommended = claudeTriagePingRecommended(row);

    // The github @claude comment is suppressed for any PR where a local resolver is active
    // *or* recently completed *or* was spawned this tick — even if `ok=false`, we don't want
    // to double-post during the same tick. Genuine prereq-skips (no clone, no claude CLI)
    // fall through to the github fallback.
    const localResolverStartedThisTick =
      row.local_conflict_resolution.action === "started_in_background" ||
      row.local_ci_resolution.action === "started_in_background" ||
      row.local_gemini_resolution.action === "started_in_background";
    const localResolverDryRunThisTick =
      args.dryRun &&
      (row.local_conflict_resolution.action === "dry_run" ||
        row.local_ci_resolution.action === "dry_run" ||
        row.local_gemini_resolution.action === "dry_run");
    const localTookOver =
      localResolverStartedThisTick ||
      localResolverDryRunThisTick ||
      Boolean(inFlightForPr) ||
      (completedFromPriorTick && completedFromPriorTick.ok === true);

    const commentResult = await maybePostTriageComment(owner, repo, prMerge.number, headSha, row, ping, {
      dryRun: args.dryRun,
      forceComment: args.forceComment,
      suppressBecauseLocalTookOver: localTookOver,
    });
    row.triage_comment_action = commentResult.action;
    row.triage_comment_url = commentResult.url ?? null;
    row.triage_comment_detail = commentResult.detail ?? null;

    const prBrief = {
      number: prMerge.number,
      title: prMerge.title,
      url: prMerge.html_url,
    };
    if (localTookOver) {
      /** @type {Array<{ kind: string, state: string, action: string | null, detail: string | null, pid?: number, threads_resolved?: number | null }>} */
      const events = [];
      // a) result file from a prior tick — the resolver finished while we were idle
      if (completedFromPriorTick) {
        events.push({
          kind: completedFromPriorTick.kind ?? "unknown",
          state: completedFromPriorTick.ok ? "completed_ok" : "completed_failed",
          action: completedFromPriorTick.action ?? null,
          detail: completedFromPriorTick.detail ?? null,
          threads_resolved: completedFromPriorTick.threads_resolved ?? null,
        });
      }
      // b) lockfile still alive from a prior tick — child running right now
      if (inFlightForPr) {
        events.push({
          kind: inFlightForPr.kind,
          state: "in_flight",
          action: "in_flight",
          detail: `pid ${inFlightForPr.pid}, started ${inFlightForPr.startedAt}`,
          pid: inFlightForPr.pid,
        });
      }
      // c) freshly spawned this tick (or dry-run preview)
      for (const [kind, r] of /** @type {Array<["conflict"|"ci"|"gemini", Record<string, unknown>]>} */ ([
        ["conflict", row.local_conflict_resolution],
        ["ci", row.local_ci_resolution],
        ["gemini", row.local_gemini_resolution],
      ])) {
        if (r.action === "started_in_background") {
          events.push({
            kind,
            state: "spawned_this_tick",
            action: r.action,
            detail: r.detail ?? null,
            pid: typeof r.pid === "number" ? r.pid : undefined,
            threads_resolved: null,
          });
        } else if (r.action === "dry_run") {
          events.push({
            kind,
            state: "dry_run",
            action: r.action,
            detail: r.detail ?? null,
            threads_resolved: null,
          });
        }
      }
      summary.localResolverActed.push({ ...prBrief, events });
    } else if (!ping.triage_ping_recommended) {
      if ((row.queued_or_running ?? 0) > 0) {
        summary.ciInProgress.push(prBrief);
      } else {
        summary.readyToReview.push(prBrief);
      }
    } else if ((row.queued_or_running ?? 0) > 0 && !row.claude_triage_ping_recommended) {
      summary.ciInProgress.push(prBrief);
    } else if (!row.claude_triage_ping_recommended) {
      summary.workflowApprovalPending.push({
        ...prBrief,
        reason: describeNoBotPingReason(row),
      });
    } else if (commentResult.action === "posted") {
      summary.reworkCommentPosted.push(prBrief);
    } else if (commentResult.action === "dry_run_would_post") {
      summary.reworkWouldPost.push(prBrief);
    } else if (
      commentResult.action === "skipped" ||
      commentResult.action === "dry_run_skipped"
    ) {
      summary.reworkCommentSkipped.push({
        ...prBrief,
        detail: commentResult.detail ?? "",
      });
    }

    const desiredTriage = triageLabelConfig
      ? computeDesiredTriageStateLabel(row, ping, triageLabelConfig)
      : { key: "none", name: null, stateKey: "none" };

    /** @type {{ key: string, removed: string[], added: string | null, dryRun: boolean, error?: boolean }} */
    const labelSync = triageLabelConfig
      ? await syncTriageStateLabels(
          owner,
          repo,
          prMerge.number,
          prMerge.labels ?? [],
          desiredTriage.name,
          managedTriageLabelNames,
          desiredTriage.stateKey,
          args.dryRun,
        )
      : { key: "none", removed: [], added: null, dryRun: false, error: false };
    row.triage_state_key = desiredTriage.key;
    row.triage_state_key_human = triageStateKeyHumanSentence(desiredTriage.key);
    row.triage_state_label = desiredTriage.name;
    row.triage_state_label_sync = labelSync;
    if (triageLabelConfig) {
      const removed = labelSync.removed || [];
      const hasWork = removed.length > 0 || labelSync.added != null || labelSync.error;
      if (hasWork) {
        summary.triageStateLabelSync.push({
          ...prBrief,
          to_key: desiredTriage.key,
          to_key_human: triageStateKeyHumanSentence(desiredTriage.key),
          to_label: desiredTriage.name,
          removed,
          added: labelSync.added,
          dry_run: Boolean(labelSync.dryRun),
          error: labelSync.error === true,
        });
      }
    }

    results.push(row);

    if (!args.json) {
      console.log(
        `PR #${prMerge.number}: ${prMerge.title.slice(0, 72)}${prMerge.title.length > 72 ? "…" : ""}`,
      );
      console.log(
        `  branch=${prMerge.head?.ref} url=${prMerge.html_url} mergeable=${formatUnknown(prMerge.mergeable)} mergeStateStatus=${formatUnknown(prMerge.mergeable_state)}`,
      );
      const wfBefore = wfResult.workflows_awaiting_approval_before ?? 0;
      const wfAfter = wfResult.workflows_awaiting_approval_after ?? 0;
      const wfApproved = wfResult.workflows_approved_run_ids?.length ?? 0;
      console.log(
        `  workflows_awaiting_approval: before=${wfBefore} after=${wfAfter} approved_this_run=${wfApproved}`,
      );
      if (wfResult.workflows_approve_errors?.length > 0) {
        for (const err of wfResult.workflows_approve_errors) {
          const pathHint = err.workflow_path ? ` path=${err.workflow_path}` : "";
          const viaHint = err.via ? ` via=${err.via}` : "";
          console.log(
            `    ! approve failed run_id=${err.run_id}${pathHint}${viaHint} http=${err.status} ${(err.detail || "").slice(0, 320)}`,
          );
        }
      }
      if (checksInProgress) {
        console.log(
          "  [note] Not approving workflows or empty-commit retriggers: some check run(s) are still queued or in progress on the head; waiting (no changes made).",
        );
      }
      console.log(
        `  check_runs=${ci.check_runs} completed_ok=${ci.completed_ok} completed_fail=${ci.completed_fail} skipped=${ci.skipped} cancelled=${ci.cancelled} queued_or_running=${ci.queued_or_running} has_ci=${ci.has_ci} failures=${ci.failures} conflict=${row.conflict} mergeability_indeterminate=${row.mergeability_indeterminate ? 1 : 0} ci_missing=${row.ci_missing} min_passed_checks=${row.pr_triage_min_passed_checks ?? getMinRequiredPassedCheckRuns()} auto_empty_below_check_runs=${row.pr_triage_auto_empty_commit_min_check_runs ?? getCheckRunCountFloorForAutoEmptyCommit()}`,
      );
      const labelBit =
        row.gemini_feedback_actioned_label == null
          ? "actioned_label_disabled"
          : row.gemini_feedback_actioned_label;
      console.log(
        `  gemini_unresolved_threads=${row.gemini_unresolved_count} gemini_triage_block=${geminiUnresolvedBlocksTriage(row)} actioned_label="${labelBit}" actioned_label_set=${row.gemini_feedback_actioned_label_set} claude_attestation=${row.gemini_claude_attestation_present ? "yes" : "no"}`,
      );
      console.log(formatDecisionLine(prMerge.number, ping, row));
      if (args.dryRun && wfBefore > 0) {
        if (checksInProgress) {
          console.log(
            `  [note] Dry-run: would not approve ${wfBefore} workflow run(s) (check run(s) in progress on head — re-run when CI settles).`,
          );
        } else {
          console.log(
            `  [action] Dry-run: would call approve API for ${wfBefore} workflow run(s) (omit --dry-run to run).`,
          );
          if (wfResult.workflows_would_empty_commit_retrigger) {
            console.log(
              `  [action] Dry-run: would push an empty commit to \`${headRef}\` if runs are still blocked after that.`,
            );
          }
          if (wfResult.workflows_would_prefer_local_git) {
            console.log(
              `  [action] Dry-run: would use local git in \`${gitCwd}\` (empty commit + push, then \`git checkout -\`) if runs are still blocked; otherwise the Git Data API.`,
            );
          }
        }
      } else if (args.noApproveWorkflows && wfBefore > 0) {
        console.log(
          `  [action] Workflow approval disabled (--no-approve-workflows); ${wfBefore} run(s) still awaiting approval.`,
        );
      } else if (!args.dryRun && !args.noApproveWorkflows && wfBefore > 0 && !checksInProgress) {
        if (wfApproved > 0) {
          console.log(
            `  [action] Approved ${wfApproved} workflow run(s) awaiting maintainer approval (${wfAfter} still waiting).`,
          );
        } else if (wfResult.workflows_approve_errors?.length > 0) {
          console.log(
            `  [action] Could not approve workflow runs (${wfResult.workflows_approve_errors.length} error(s)); see lines above.`,
          );
        }
        const ect = wfResult.workflows_empty_commit_retrigger;
        if (ect) {
          if (ect.ok && ect.previous_sha && ect.new_head_sha) {
            const via = "via" in ect ? ect.via : undefined;
            console.log(
              `  [action] Pushed empty commit to re-trigger CI: ${ect.previous_sha.slice(0, 7)} → ${ect.new_head_sha.slice(0, 7)}${via ? ` (${via})` : ""}`,
            );
            if (via === "local") {
              console.log(
                "  [note] Restored the previous checked-out ref with `git checkout -` (local git retrigger).",
              );
            }
          } else if (!ect.ok) {
            console.log(`  [action] Empty-commit CI retrigger failed: ${ect.detail || ""}`);
          }
        }
      }
      {
        const she = stalledEmptyResult.stalled_head_empty_commit_retrigger;
        if (she) {
          if (she.dry_run && she.would) {
            console.log(
              `  [action] Dry-run: would push an empty commit on \`${headRef}\` (check run count ${she.have_check_runs ?? "?" } < ${she.min_check_runs_to_skip_auto ?? "?" } per PR_TRIAGE_AUTO_EMPTY_COMMIT_WHEN_CHECK_RUNS_BELOW) to re-run/seed CI.`,
            );
          } else if (she.ok && she.new_head_sha && she.previous_sha) {
            const via = "via" in she ? she.via : undefined;
            console.log(
              `  [action] Pushed empty commit (stalled/short check list on head) to re-run CI: ${she.previous_sha.slice(0, 7)} → ${she.new_head_sha.slice(0, 7)}${via ? ` (${via})` : ""}`,
            );
            if (via === "local") {
              console.log(
                "  [note] Restored the previous checked-out ref with `git checkout -` (local git retrigger).",
              );
            }
          } else if (she.ok === false && she.detail) {
            console.log(`  [action] Stalled-head empty-commit retrigger failed: ${she.detail || ""}`);
          }
        }
      }
      if (commentResult.action === "posted") {
        console.log(`  [action] Posted triage comment: ${commentResult.url}`);
      } else if (commentResult.action === "skipped") {
        console.log(`  [action] Comment skipped: ${commentResult.detail}`);
      } else if (commentResult.action === "dry_run_would_post") {
        console.log(`  [action] Dry-run: ${commentResult.detail}`);
      } else if (commentResult.action === "dry_run_skipped") {
        console.log(`  [action] Dry-run: ${commentResult.detail}`);
      } else if (
        commentResult.action === "none" &&
        ping.triage_ping_recommended &&
        !row.claude_triage_ping_recommended
      ) {
        if (wfAfter > 0) {
          console.log(
            `  [note] No @claude comment: ${wfAfter} workflow run(s) still flagged after approve API + optional empty-commit push. You may still need **Approve workflows** in the GitHub UI for some policies; see \`! approve failed\` / empty-commit lines above.`,
          );
        } else if ((row.queued_or_running ?? 0) > 0) {
          console.log(
            `  [note] No @claude comment: check runs still in progress; wait for completion before a code-triage follow-up from the bot.`,
          );
        } else if (mergeableStateIsBlockingGates(row.mergeable_state)) {
          console.log(
            `  [note] No @claude comment: GitHub still blocks merge (mergeable_state: ${row.mergeable_state != null ? String(row.mergeable_state) : "null"}) — usually required checks/reviews/branch rules, not a one-off @claude fix.`,
          );
        } else if (hasInsufficientCompletedSuccessCount(row)) {
          console.log(
            `  [note] No @claude comment: not enough green check run(s) yet (${row.completed_ok ?? 0}/${getMinRequiredPassedCheckRuns()}) — wait for more jobs to complete.`,
          );
        } else {
          console.log(
            `  [note] No @claude comment: this triage signal is not delegated to the bot (see \`[decision]\` line and triage_ping_reasons in JSON).`,
          );
        }
      }
      if (triageLabelConfig) {
        const removed = labelSync.removed || [];
        const humanState = triageStateKeyHumanSentence(desiredTriage.key);
        const dr = labelSync.dryRun ? " [dry-run: no GitHub writes]" : "";
        if (labelSync.error) {
          console.log(
            `  [action] GitHub triage labels${dr}: ERROR while applying state "${humanState}"${
              desiredTriage.name ? ` (GitHub label \`${desiredTriage.name}\`)` : ""
            }.`,
          );
        } else if (removed.length > 0 || labelSync.added != null) {
          const rmTxt =
            removed.length > 0
              ? `Removed: ${removed.map((n) => `\`${n}\``).join(", ")}. `
              : "";
          const adTxt =
            labelSync.added != null ? `Added: \`${labelSync.added}\`.` : "Added: (none).";
          console.log(`  [action] GitHub triage labels${dr}: ${humanState} — ${rmTxt}${adTxt}`);
        }
      }
      console.log("");
    }
  }

  let claudeGitRefs = await listClaudeGitRefs(owner, repo);
  let orphanClaudeBranches = findOrphanClaudeBranches(claudeGitRefs, openHeadRefs);

  /** @type {Array<Record<string, unknown>>} */
  let orphanPrCreationResults = [];

  const canCreateOrphanPrs =
    !args.noCreateOrphanPrs && args.prFilter == null && orphanClaudeBranches.length > 0;

  if (canCreateOrphanPrs) {
    const baseBranch = await fetchRepositoryDefaultBranch(owner, repo);
    orphanPrCreationResults = await createPullRequestsForOrphanBranches(
      owner,
      repo,
      orphanClaudeBranches,
      baseBranch,
      {
        dryRun: args.dryRun,
        deleteMergedClaudeBranches: args.deleteMergedClaudeBranches,
      },
    );

    const created = orphanPrCreationResults.filter((r) => r.action === "created").length;
    const deletedRemote = orphanPrCreationResults.some((r) => r.remote_branch_deleted === true);
    if (!args.dryRun && (created > 0 || deletedRemote)) {
      const allOpenPullsAfter = await listOpenPulls(owner, repo);
      const openHeadRefsAfter = new Set(
        allOpenPullsAfter.map((p) => p.head?.ref).filter((r) => typeof r === "string"),
      );
      claudeGitRefs = await listClaudeGitRefs(owner, repo);
      orphanClaudeBranches = findOrphanClaudeBranches(claudeGitRefs, openHeadRefsAfter);
    }
  }

  if (!args.json) {
    if (args.prFilter != null) {
      console.log("[orphan-claude-prs] skipped (single --pr mode does not create orphan PRs)");
    } else if (args.noCreateOrphanPrs) {
      console.log("[orphan-claude-prs] skipped (--no-create-orphan-prs)");
    } else if (orphanPrCreationResults.length > 0) {
      for (const r of orphanPrCreationResults) {
        if (r.action === "created" && r.url) {
          console.log(`[orphan-claude-prs] created PR #${r.number}: ${r.branch} → ${r.url}`);
        } else if (r.action === "dry_run_would_create") {
          const t = String(r.title || "");
          const preview = t.length > 72 ? `${t.slice(0, 72)}…` : t;
          console.log(`[orphan-claude-prs] dry-run: would create PR for ${r.branch} (title: ${preview})`);
        } else if (r.action === "skipped_already_exists") {
          console.log(`[orphan-claude-prs] skipped (PR already exists): ${r.branch}`);
        } else if (r.action === "failed") {
          console.log(`[orphan-claude-prs] failed ${r.branch}: ${r.detail || ""}`);
        } else if (r.action === "skipped_branch_too_old") {
          console.log(
            `[orphan-claude-prs] skipped (first commit >7d ago): ${r.branch} (${r.first_commit_at || ""})`,
          );
        } else if (r.action === "skipped_could_not_verify_branch_age") {
          console.log(`[orphan-claude-prs] skipped (could not verify branch age): ${r.branch}`);
        } else if (r.action === "skipped_nothing_to_merge") {
          let line = `[orphan-claude-prs] skipped (already in base): ${r.branch} — ${r.detail || ""}`;
          if (r.remote_branch_deleted) line += " [deleted remote branch]";
          else if (r.remote_branch_delete_would) line += " [dry-run: would delete remote branch]";
          else if (r.remote_branch_delete_error) {
            line += ` [delete ref failed: ${r.remote_branch_delete_error}]`;
          }
          console.log(line);
        } else if (r.action === "skipped_head_sha_already_merged") {
          let line = `[orphan-claude-prs] skipped (head SHA already merged): ${r.branch} — ${r.detail || ""}`;
          if (r.remote_branch_deleted) line += " [deleted remote branch]";
          else if (r.remote_branch_delete_would) line += " [dry-run: would delete remote branch]";
          else if (r.remote_branch_delete_error) {
            line += ` [delete ref failed: ${r.remote_branch_delete_error}]`;
          }
          console.log(line);
        }
      }
    }

    if (orphanClaudeBranches.length === 0) {
      console.log("[orphan-claude-branches] 0 remote claude/* branch(es) with no open PR");
    } else {
      const names = orphanClaudeBranches.map((o) => o.name).join(", ");
      console.log(
        `[orphan-claude-branches] ${orphanClaudeBranches.length} branch(es) with no open PR: ${names}`,
      );
    }
    console.log("");
  }

  if (!args.json) {
    printConsoleSummary(summary, orphanClaudeBranches);
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          pull_requests: results,
          orphan_claude_branches: orphanClaudeBranches,
          orphan_claude_pr_creation: orphanPrCreationResults,
          summary: {
            rework_comment_posted: summary.reworkCommentPosted,
            rework_would_post_dry_run: summary.reworkWouldPost,
            rework_comment_skipped: summary.reworkCommentSkipped,
            workflow_approval_pending: summary.workflowApprovalPending,
            ready_to_review: summary.readyToReview,
            ci_in_progress: summary.ciInProgress,
            triage_state_label_sync: summary.triageStateLabelSync,
          },
        },
        null,
        2,
      ),
    );
  }

  if (
    args.failOnGeminiUnresolved &&
    results.some((r) => geminiUnresolvedBlocksTriage(r))
  ) {
    process.exit(2);
  }
  if (args.failOnTriagePing && results.some((r) => r.triage_ping_recommended)) {
    process.exit(2);
  }
}

