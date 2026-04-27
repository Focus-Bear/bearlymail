import process from "node:process";

import {
  hasInsufficientCompletedSuccessCount,
  getMinRequiredPassedCheckRuns,
} from "./ci.mjs";
import {
  DEFAULT_GEMINI_CLAUDE_ATTESTATION_SUBSTRING,
  DEFAULT_READY_FOR_REVIEW_LABEL,
  DEFAULT_TRIAGE_STATE_LABELS,
  TRIAGE_COMMENT_MARKER,
  TRIAGE_LABEL_COLORS,
  TRIAGE_LABEL_DESCRIPTIONS,
  TRIAGE_STATE_KEY_HUMAN,
} from "./constants.mjs";
import { hasActiveClaudeCodeWorkflow, geminiUnresolvedBlocksTriage, getGeminiActionedLabel, getGeminiClaudeAttestationSubstring } from "./gemini.mjs";
import { fetchIssueComments, githubRestDelete, githubRestPost } from "./github.mjs";
import { localConflictResolutionTookOver } from "./conflict-resolver.mjs";
import { mergeableStateIsBlockingGates } from "./merge-state.mjs";

/**
 * @param {string} key
 * @returns {string}
 */
export function triageStateKeyHumanSentence(key) {
  if (key && typeof key === "string" && TRIAGE_STATE_KEY_HUMAN[key]) {
    return TRIAGE_STATE_KEY_HUMAN[key];
  }
  return key ? String(key) : "Unknown state";
}

/**
 * @param {{ noTriageStateLabels?: boolean } | null} [args]
 * @returns {boolean}
 */
function triageStateLabelsGloballyEnabled(args) {
  if (args?.noTriageStateLabels) return false;
  if (process.env.PR_TRIAGE_STATE_LABELS === "") return false;
  return true;
}

/**
 * @param {{ noTriageStateLabels?: boolean, noReadyForReviewLabel?: boolean } | null} [args]
 * @returns {null | {
 *   mergeConflict: string | null,
 *   mergeStateUnknown: string | null,
 *   ciFailing: string | null,
 *   insufficientSuccess: string | null,
 *   geminiReview: string | null,
 *   workflowApproval: string | null,
 *   ciMissing: string | null,
 *   ciInProgress: string | null,
 *   needsAttention: string | null,
 *   ready: string | null,
 * }}
 */
export function getTriageStateLabelConfig(args) {
  if (!triageStateLabelsGloballyEnabled(args)) return null;
  const pick = (envKey, def) => {
    const v = process.env[envKey];
    if (v === "") return null;
    if (v != null && String(v).trim() !== "") return String(v).trim();
    return def;
  };
  let ready = null;
  if (!args?.noReadyForReviewLabel) {
    if (process.env.PR_TRIAGE_READY_FOR_REVIEW_LABEL === "") {
      ready = null;
    } else if (
      process.env.PR_TRIAGE_READY_FOR_REVIEW_LABEL != null &&
      process.env.PR_TRIAGE_READY_FOR_REVIEW_LABEL !== ""
    ) {
      ready = String(process.env.PR_TRIAGE_READY_FOR_REVIEW_LABEL).trim() || null;
    } else {
      ready = DEFAULT_READY_FOR_REVIEW_LABEL;
    }
  }

  return {
    mergeConflict: pick("PR_TRIAGE_LABEL_MERGE_CONFLICT", DEFAULT_TRIAGE_STATE_LABELS.mergeConflict),
    mergeStateUnknown: pick("PR_TRIAGE_LABEL_MERGE_STATE_UNKNOWN", DEFAULT_TRIAGE_STATE_LABELS.mergeStateUnknown),
    ciFailing: pick("PR_TRIAGE_LABEL_CI_FAILING", DEFAULT_TRIAGE_STATE_LABELS.ciFailing),
    geminiReview: pick("PR_TRIAGE_LABEL_GEMINI_REVIEW", DEFAULT_TRIAGE_STATE_LABELS.geminiReview),
    workflowApproval: pick("PR_TRIAGE_LABEL_WORKFLOW_APPROVAL", DEFAULT_TRIAGE_STATE_LABELS.workflowApproval),
    ciMissing: pick("PR_TRIAGE_LABEL_CI_MISSING", DEFAULT_TRIAGE_STATE_LABELS.ciMissing),
    ciInProgress: pick("PR_TRIAGE_LABEL_CI_IN_PROGRESS", DEFAULT_TRIAGE_STATE_LABELS.ciInProgress),
    needsAttention: pick("PR_TRIAGE_LABEL_NEEDS_ATTENTION", DEFAULT_TRIAGE_STATE_LABELS.needsAttention),
    insufficientSuccess: pick("PR_TRIAGE_LABEL_INSUFFICIENT_SUCCESS", DEFAULT_TRIAGE_STATE_LABELS.insufficientSuccess),
    ready,
  };
}

/**
 * @param {NonNullable<ReturnType<typeof getTriageStateLabelConfig>>} L
 * @returns {string[]}
 */
export function getAllManagedTriageLabelNames(L) {
  const set = new Set();
  for (const v of Object.values(L)) {
    if (v && typeof v === "string") set.add(v);
  }
  return [...set];
}

/**
 * Single triage state label (priority order). `none` = remove all managed labels.
 * @param {Record<string, unknown>} row
 * @param {{ triage_ping_recommended: boolean }} ping
 * @param {NonNullable<ReturnType<typeof getTriageStateLabelConfig>>} L
 */
export function computeDesiredTriageStateLabel(row, ping, L) {
  if (row.conflict === 1 && L.mergeConflict) {
    return { key: "merge_conflict", name: L.mergeConflict, stateKey: "mergeConflict" };
  }
  if (row.mergeability_indeterminate && L.mergeStateUnknown) {
    return { key: "merge_state_unknown", name: L.mergeStateUnknown, stateKey: "mergeStateUnknown" };
  }
  if ((row.failures ?? 0) > 0 && L.ciFailing) {
    return { key: "ci_failing", name: L.ciFailing, stateKey: "ciFailing" };
  }
  if ((row.queued_or_running ?? 0) > 0 && L.ciInProgress) {
    return { key: "ci_in_progress", name: L.ciInProgress, stateKey: "ciInProgress" };
  }
  if ((row.ci_missing ?? 0) === 1 && L.ciMissing) {
    return { key: "ci_missing", name: L.ciMissing, stateKey: "ciMissing" };
  }
  if (hasInsufficientCompletedSuccessCount(row) && L.insufficientSuccess) {
    return { key: "insufficient_success", name: L.insufficientSuccess, stateKey: "insufficientSuccess" };
  }
  if (geminiUnresolvedBlocksTriage(row) && L.geminiReview) {
    return { key: "gemini", name: L.geminiReview, stateKey: "geminiReview" };
  }
  if ((row.workflows_awaiting_approval_after ?? 0) > 0 && L.workflowApproval) {
    return { key: "workflow_approval", name: L.workflowApproval, stateKey: "workflowApproval" };
  }
  if (!ping.triage_ping_recommended && (row.queued_or_running ?? 0) === 0 && L.ready) {
    return { key: "ready", name: L.ready, stateKey: "ready" };
  }
  if (ping.triage_ping_recommended && L.needsAttention) {
    return { key: "needs_attention", name: L.needsAttention, stateKey: "needsAttention" };
  }
  return { key: "none", name: null, stateKey: "none" };
}

const triageLabelCreateCache = new Set();

/**
 * Create the label in the repository if missing.
 * @param {string} stateKey
 */
async function ensureRepositoryTriageLabelExists(owner, repo, labelName, stateKey) {
  const key = `${owner}/${repo}/${labelName}`;
  if (triageLabelCreateCache.has(key)) return;
  const color = TRIAGE_LABEL_COLORS[stateKey] || "5319E7";
  const description = TRIAGE_LABEL_DESCRIPTIONS[stateKey] || "pr-claude-triage state label";
  try {
    await githubRestPost(`/repos/${owner}/${repo}/labels`, {
      name: labelName,
      color,
      description,
    });
  } catch (e) {
    const m = (e && e.message) || String(e);
    if (!/422|Validation Failed|already exists/i.test(m)) {
      throw e;
    }
  }
  triageLabelCreateCache.add(key);
}

/**
 * Removes any managed triage label that is not `desiredName`, then adds `desiredName` if set.
 * @param {string[]} managedNames
 * @param {string | null} desiredName
 * @returns {Promise<{ key: string, removed: string[], added: string | null, dryRun: boolean, error?: boolean }>}
 */
export async function syncTriageStateLabels(
  owner,
  repo,
  issueNumber,
  currentLabelNodes,
  desiredName,
  managedNames,
  desiredStateKey,
  dryRun,
) {
  const present = new Set(
    (currentLabelNodes ?? []).map((l) => (l && l.name) || "").filter(Boolean),
  );
  const managed = new Set(managedNames);
  const toRemove = [...present].filter((n) => managed.has(n) && n !== desiredName);
  const needAdd = Boolean(desiredName) && !present.has(desiredName);

  if (toRemove.length === 0 && !needAdd) {
    return { key: desiredStateKey, removed: [], added: null, dryRun: false, error: false };
  }
  if (dryRun) {
    return {
      key: desiredStateKey,
      removed: toRemove,
      added: needAdd ? desiredName : null,
      dryRun: true,
      error: false,
    };
  }
  for (const name of toRemove) {
    const enc = encodeURIComponent(name);
    const { ok, status, text } = await githubRestDelete(
      `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${enc}`,
    );
    if (!ok) {
      console.error(
        `[triage label] remove ${name} failed for #${issueNumber}: http=${status} ${(text || "").slice(0, 200)}`,
      );
      return { key: desiredStateKey, removed: [], added: null, dryRun: false, error: true };
    }
  }
  if (needAdd && desiredName) {
    try {
      await ensureRepositoryTriageLabelExists(owner, repo, desiredName, desiredStateKey);
      await githubRestPost(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, { labels: [desiredName] });
    } catch (e) {
      console.error(`[triage label] add failed for #${issueNumber}: ${(e && e.message) || e}`);
      return { key: desiredStateKey, removed: toRemove, added: null, dryRun: false, error: true };
    }
  }
  return {
    key: desiredStateKey,
    removed: toRemove,
    added: needAdd ? desiredName : null,
    dryRun: false,
    error: false,
  };
}

/**
 * When the rollup is not "ready to merge" / "healthy": CI, merge, Gemini, branch protection, or enough green checks.
 * (Console / exit-code rollup — includes workflow approval backlog and mergeability vs PR_TRIAGE_MIN_PASSED_CHECKS.)
 */
export function triagePingRecommended(row) {
  const reasons = [];
  if ((row.failures ?? 0) > 0) {
    reasons.push(`completed check failures (${row.failures})`);
  }
  if (row.conflict === 1) {
    reasons.push("merge conflict (not mergeable)");
  }
  if (row.mergeability_indeterminate) {
    reasons.push(
      "mergeable state not resolved by API (confirm on PR: conflicts / behind base / or wait for GitHub to finish computing)",
    );
  }
  if (row.ci_missing === 1) {
    reasons.push("no check runs on the current head (CI not reported yet, or not triggered on this commit)");
  }
  if ((row.queued_or_running ?? 0) > 0) {
    reasons.push(
      `check run(s) queued or in progress (${row.queued_or_running}) — wait for CI to finish before calling it green`,
    );
  }
  if (hasInsufficientCompletedSuccessCount(row)) {
    const min = getMinRequiredPassedCheckRuns();
    let line = `insufficient green check run count (${row.completed_ok ?? 0} success, need at least ${min} per PR_TRIAGE_MIN_PASSED_CHECKS)`;
    if ((row.skipped ?? 0) > 0) {
      line += `; ${row.skipped} run(s) have conclusion "skipped" in the API (if the main CI was skipped, check workflow if:/paths; a no-op retrigger can still skip the same work)`;
    }
    reasons.push(line);
  }
  const wfPending = row.workflows_awaiting_approval_after ?? 0;
  if (wfPending > 0) {
    reasons.push(`GitHub Actions workflows awaiting approval (${wfPending})`);
  }
  if (geminiUnresolvedBlocksTriage(row)) {
    reasons.push(
      `unresolved Gemini inline review threads (${row.gemini_unresolved_count})`,
    );
  }
  return {
    triage_ping_recommended: reasons.length > 0,
    triage_ping_reasons: reasons,
  };
}

/**
 * Whether to post an @claude triage comment. Skips: workflow approval (this script or UI), in-flight checks,
 * mergeability-only gates (not enough green checks, GitHub "blocked" until more checks), which are not code fixes.
 */
export function claudeTriagePingRecommended(row) {
  if ((row.failures ?? 0) > 0) return true;
  // Merge conflicts intentionally never trigger an @claude github ping — github @claude
  // is poor at resolving conflicts, so we route them to a local `claude -p` session in a
  // worktree (see conflict-resolver.mjs). When the local resolver can't run (no clone,
  // no claude CLI, etc.) we still skip the github ping; the merge-conflict label is
  // enough for a human to pick it up.
  if (row.mergeability_indeterminate) return true;
  if ((row.queued_or_running ?? 0) > 0) return false;
  if (mergeableStateIsBlockingGates(row.mergeable_state)) return false;
  if (hasInsufficientCompletedSuccessCount(row)) return false;
  if (geminiUnresolvedBlocksTriage(row)) return true;
  return false;
}

export function formatDecisionLine(prNumber, ping, row) {
  if (!ping.triage_ping_recommended) {
    const inFlight = (row?.queued_or_running ?? 0) > 0;
    if (inFlight) {
      return `[decision] No triage ping for PR #${prNumber}: ${row.queued_or_running} check run(s) still queued or in progress — this should have forced a triage ping; if you see this line, re-run the script (bug).`;
    }
    if (
      (row.gemini_unresolved_count ?? 0) > 0 &&
      row.gemini_feedback_actioned_label_set
    ) {
      const name = getGeminiActionedLabel() ?? "all-gemini-feedback-actioned";
      return `[decision] No triage ping for PR #${prNumber}: no completed check failures, merge/clear, workflows not blocked. Open Gemini thread(s) on the diff, but \`${name}\` is set — we trust (not triage-blocking).`;
    }
    if ((row.gemini_unresolved_count ?? 0) > 0 && row.gemini_claude_attestation_present) {
      const sub = getGeminiClaudeAttestationSubstring() ?? DEFAULT_GEMINI_CLAUDE_ATTESTATION_SUBSTRING;
      return `[decision] No triage ping for PR #${prNumber}: no other blockers; inline threads still open in API, but latest Claude issue comment attests ${JSON.stringify(sub)} (not triage-blocking; set label or resolve threads in UI if you disagree).`;
    }
    const min = getMinRequiredPassedCheckRuns();
    const mss = row.mergeable_state != null ? String(row.mergeable_state) : "null";
    const acc =
      min > 0
        ? `green check runs: ${row.completed_ok ?? 0} (min ${min} from PR_TRIAGE_MIN_PASSED_CHECKS); mergeable_state=${mss}`
        : "PR_TRIAGE_MIN_PASSED_CHECKS=0 (no minimum count enforced); mergeable_state not covered by that rule";
    return `[decision] No triage ping for PR #${prNumber}: ${acc}. No completed failures, merge conflict flag clear, no unresolved triage-inline Gemini, workflows not blocked on approval.`;
  }
  const joined = ping.triage_ping_reasons.join("; ");
  return `[decision] Triage ping recommended for PR #${prNumber}: ${joined}.`;
}

export function buildTriageCommentBody(row) {
  const lines = [
    TRIAGE_COMMENT_MARKER,
    "",
    "@claude **Triage automation:** please address **all** of the following before merge:",
    "",
  ];

  let i = 1;
  const hasCiFailures = (row.failures ?? 0) > 0;
  // Merge conflicts are intentionally never surfaced in the @claude github comment —
  // they are routed to a local `claude -p` session instead (see conflict-resolver.mjs).
  // The triage/merge-conflict label still flags the PR for a human; that's enough.
  const hasConflict = false;
  const hasMergeIndeterminate = row.mergeability_indeterminate === true;
  const geminiN = row.gemini_unresolved_count ?? 0;
  const hasGemini = geminiUnresolvedBlocksTriage(row);

  if (hasCiFailures) {
    lines.push(`### ${i++}. CI failures`);
    lines.push(
      `**${row.failures}** check run(s) reported failure. Fix the underlying issues, push commits, and get required checks passing.`,
    );
    lines.push("");
  }

  if (hasConflict) {
    lines.push(`### ${i++}. Merge conflicts`);
    lines.push(
      `This PR does **not** merge cleanly into the base branch. Resolve conflicts (merge ` +
        `\`main\` / rebase), fix any fallout, and push.`,
    );
    lines.push("");
  } else if (hasMergeIndeterminate) {
    lines.push(`### ${i++}. Merge status`);
    lines.push(
      "GitHub APIs did not return a definitive merge result in time. The PR may still show **merge conflicts** " +
        "on github.com — merge or rebase the base branch, resolve conflicts, and push so checks and merge " +
        "state are accurate.",
    );
    lines.push("");
  }

  if (hasGemini) {
    lines.push(`### ${i++}. Gemini Code Assist review`);
    lines.push(
      `**${geminiN}** unresolved inline review thread(s). Open **Files changed**, address each comment in code, then **Resolve** or reply on every thread.`,
    );
    lines.push(
      "After you finish the implementation, **come back and clear every Gemini thread** (resolve or reply with what changed) so nothing is left open before merge.",
    );
    const attest = getGeminiClaudeAttestationSubstring();
    if (attest) {
      lines.push(
        `When all Gemini feedback is fully addressed in code (even if GitHub still shows open threads), include this exact phrase in your **issue comment** reply so automation can stop re-pinging: **${attest}**`,
      );
    }
    lines.push("");
  }

  if (i === 1) {
    lines.push("_(No structured block matched — raw signals:)_");
    for (const r of row.triage_ping_reasons ?? []) {
      lines.push(`- ${r}`);
    }
  }

  return lines.join("\n").trimEnd();
}

export function issueHasTriageMarker(comments) {
  return (comments ?? []).some((c) => typeof c.body === "string" && c.body.includes(TRIAGE_COMMENT_MARKER));
}

/**
 * Skip posting another @claude triage comment while `.github/workflows/claude.yml` is still running on
 * this head SHA — even if the only prior activity was a Claude Code **issue comment** (e.g. “Resolving
 * merge conflicts…”) that does **not** include `<!-- pr-ci-gemini-triage -->`. Previously we only skipped
 * when that marker existed, which caused duplicate pings.
 *
 * When Claude is idle, post (or refresh) the triage comment whether or not a marker already exists.
 *
 * @returns {{ action: string, url?: string, detail?: string }}
 */
export async function maybePostTriageComment(owner, repo, prNumber, headSha, row, ping, options) {
  if (!claudeTriagePingRecommended(row)) {
    return { action: "none" };
  }
  if (!ping.triage_ping_recommended) {
    return { action: "none" };
  }

  if (!options.forceComment) {
    const activeClaude = await hasActiveClaudeCodeWorkflow(owner, repo, headSha);
    if (activeClaude) {
      if (options.dryRun) {
        return {
          action: "dry_run_skipped",
          detail:
            "Would skip: Claude Code (claude.yml) is already running on this commit — not posting another @claude triage comment.",
        };
      }
      return {
        action: "skipped",
        detail:
          "Claude Code (claude.yml) is still in progress on this SHA — not posting a duplicate @claude triage comment.",
      };
    }
  }

  const comments = await fetchIssueComments(owner, repo, prNumber);
  const hasMarker = issueHasTriageMarker(comments);

  if (options.dryRun) {
    return {
      action: "dry_run_would_post",
      detail: hasMarker
        ? "Would post updated triage comment (marker exists, Claude idle on this SHA)."
        : "Would post triage comment (omit --dry-run to post for real).",
    };
  }

  const body = buildTriageCommentBody(row);
  const created = await githubRestPost(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    body,
  });
  return { action: "posted", url: created.html_url };
}
