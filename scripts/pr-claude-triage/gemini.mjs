import process from "node:process";

import {
  DEFAULT_GEMINI_ACTIONED_LABEL,
  DEFAULT_GEMINI_CLAUDE_ATTESTATION_SUBSTRING,
  REVIEW_THREADS_QUERY,
  WORKFLOW_RUN_ACTIVE_STATUSES,
} from "./constants.mjs";
import { graphql, listWorkflowRunsForHeadSha } from "./github.mjs";

export function geminiBotSet() {
  const raw = process.env.GEMINI_REVIEW_BOTS || "gemini-code-assist";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * PR label: when set, we do not treat open Gemini review threads as triage blockers (trusts author/Claude).
 * `GEMINI_ACTIONED_LABEL` unset = default; empty or whitespace = disable label trust;
 * any other value = that label name.
 */
export function getGeminiActionedLabel() {
  const v = process.env.GEMINI_ACTIONED_LABEL;
  if (v === "") return null;
  const name = (v != null && v !== "" ? v : DEFAULT_GEMINI_ACTIONED_LABEL).trim();
  return name || null;
}

export function prHasGeminiActionedLabel(pr) {
  const need = getGeminiActionedLabel();
  if (!need) return false;
  const labels = pr?.labels;
  if (!Array.isArray(labels)) return false;
  return labels.some((l) => l && l.name === need);
}

/**
 * Substring that the Claude Code action must place in its **latest** issue comment when Gemini is fully
 * addressed in code (parallel to `GEMINI_ACTIONED_LABEL`). Empty env = disabled.
 */
export function getGeminiClaudeAttestationSubstring() {
  const v = process.env.GEMINI_CLAUDE_ATTESTATION_SUBSTRING;
  if (v === "") return null;
  if (v != null && String(v).trim() !== "") return String(v).trim();
  return DEFAULT_GEMINI_CLAUDE_ATTESTATION_SUBSTRING;
}

/** Logins that author “Claude finished…” issue comments on PRs (REST: `user.login`). */
export function claudeIssueCommentBotSet() {
  const raw =
    process.env.CLAUDE_ISSUE_COMMENT_BOTS || "github-actions,github-actions[bot]";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * True when the chronologically latest issue comment authored by CLAUDE_ISSUE_COMMENT_BOTS contains
 * GEMINI_CLAUDE_ATTESTATION_SUBSTRING (case-insensitive).
 * @param {unknown[]} comments REST issue comments for the PR (`user.login`, `body`, `updated_at`, `created_at`)
 */
export function geminiWaivedByLatestClaudeIssueComment(comments) {
  const substring = getGeminiClaudeAttestationSubstring();
  if (!substring) return false;
  const bots = claudeIssueCommentBotSet();
  const needle = substring.toLowerCase();

  /** @type {{ t: number, body: string } | null} */
  let latestFromBot = null;
  for (const c of comments ?? []) {
    const login =
      typeof c?.user?.login === "string"
        ? c.user.login
        : typeof c?.author?.login === "string"
          ? c.author.login
          : null;
    if (!login || !bots.has(login)) continue;
    const body = typeof c.body === "string" ? c.body : "";
    const t =
      Date.parse(typeof c.updated_at === "string" ? c.updated_at : "") ||
      Date.parse(typeof c.created_at === "string" ? c.created_at : "") ||
      0;
    if (!latestFromBot || t >= latestFromBot.t) {
      latestFromBot = { t, body };
    }
  }
  if (!latestFromBot) return false;
  return latestFromBot.body.toLowerCase().includes(needle);
}

export function threadHasGeminiComment(thread, bots) {
  const nodes = thread?.comments?.nodes ?? [];
  return nodes.some((c) => c?.author?.login && bots.has(c.author.login));
}

/**
 * Unresolved API threads that still should block our rollup, given optional trust label.
 */
export function geminiUnresolvedBlocksTriage(row) {
  const n = row.gemini_unresolved_count ?? 0;
  if (n <= 0) return false;
  if (row.gemini_feedback_actioned_label_set) return false;
  if (row.gemini_claude_attestation_present) return false;
  return true;
}

export function geminiUnresolvedTriageStatePhrase(row) {
  const n = row.gemini_unresolved_count ?? 0;
  if (n <= 0) return "no open Gemini triage";
  if (row.gemini_feedback_actioned_label_set) {
    return `triage not blocking (\`${getGeminiActionedLabel() ?? "all-gemini-feedback-actioned"}\` label)`;
  }
  if (row.gemini_claude_attestation_present) {
    const sub = getGeminiClaudeAttestationSubstring() ?? DEFAULT_GEMINI_CLAUDE_ATTESTATION_SUBSTRING;
    return `API still shows ${n} unresolved inline thread(s); triage not blocking — latest Claude issue comment attests (${JSON.stringify(sub)})`;
  }
  return `open Gemini triage: ${n} thread(s)`;
}

/**
 * Unresolved Gemini threads that still block triage.
 *
 * GitHub keeps `isResolved: false` on threads even after the commented line is fixed, until
 * someone clicks **Resolve** in the UI. When the diff moves, GitHub sets `isOutdated: true`;
 * those threads are **not** counted as blocking — the feedback was superseded by newer commits.
 */
export async function fetchUnresolvedGeminiThreads(owner, repo, prNumber, bots) {
  const blocking = [];
  const outdatedOnly = [];
  let after = null;

  for (;;) {
    const data = await graphql(REVIEW_THREADS_QUERY, {
      owner,
      name: repo,
      number: prNumber,
      after,
    });
    const pr = data?.repository?.pullRequest;
    if (!pr) {
      return {
        gemini_unresolved_threads: [],
        gemini_unresolved_count: 0,
        gemini_outdated_threads: [],
        gemini_outdated_superseded_count: 0,
      };
    }
    const conn = pr.reviewThreads;
    const nodes = conn?.nodes ?? [];
    for (const node of nodes) {
      if (node.isResolved) continue;
      if (!threadHasGeminiComment(node, bots)) continue;
      const first = node.comments?.nodes?.[0];
      const body = first?.body ?? "";
      const entry = {
        path: node.path ?? null,
        is_outdated: node.isOutdated ?? null,
        first_comment_author: first?.author?.login ?? null,
        first_comment_preview: body.length > 220 ? `${body.slice(0, 220)}…` : body,
      };
      if (node.isOutdated) {
        outdatedOnly.push(entry);
        continue;
      }
      blocking.push(entry);
    }
    const pi = conn?.pageInfo;
    if (!pi?.hasNextPage) break;
    after = pi.endCursor;
  }

  return {
    gemini_unresolved_threads: blocking,
    gemini_unresolved_count: blocking.length,
    gemini_outdated_threads: outdatedOnly,
    gemini_outdated_superseded_count: outdatedOnly.length,
  };
}

function isClaudeCodeWorkflowFile(run) {
  const p = String(run.path || "").replace(/\\/g, "/");
  return /(^|\/)claude\.ya?ml$/i.test(p);
}

export async function hasActiveClaudeCodeWorkflow(owner, repo, headSha) {
  const runs = await listWorkflowRunsForHeadSha(owner, repo, headSha);
  return runs.some(
    (r) => isClaudeCodeWorkflowFile(r) && WORKFLOW_RUN_ACTIVE_STATUSES.has(r.status),
  );
}
