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
 * By default, posts an @claude triage comment when CI failures, merge conflicts, or Gemini threads need
 * work — not for workflow approval. For blocked workflow runs it tries POST …/actions/runs/{id}/approve
 * (where GitHub allows), then **pushes an empty commit** on the PR branch to re-trigger CI if runs stay
 * blocked (Git Data API by default; set `PR_TRIAGE_USE_LOCAL_GIT=1` to use your clone: empty commit, `push`,
 * then `git checkout -`). Use `--dry-run` to only print.
 *
 * Workflow handling runs before the per-PR rollup so new check runs can appear on the updated head SHA.
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
 *   PR_TRIAGE_BASE_BRANCH  override base branch for orphan PRs (default: repo default branch from API)
 *   PR_TRIAGE_USE_LOCAL_GIT  if "1"/"true": push empty commit via local `git` (opt-in) instead of the Git
 *                            Data API, then `git checkout -` so the shell returns to the previous branch.
 *                            Implies a clean worktree and `origin` for this repository.
 *   PR_TRIAGE_GIT_CWD       directory for the above (default: cwd). Must match the repo you pass with -R.
 *   PR_TRIAGE_READY_FOR_REVIEW_LABEL  if unset: label name `ready-for-review`. If empty: do not set/remove
 *                            that label. Otherwise: that label is added when a PR is "ready to review" and
 *                            removed when it is not.
 */

import { execFileSync, execSync } from "node:child_process";
import process from "node:process";

const DEFAULT_REPO = "Focus-Bear/BearlyMail";
const API_VERSION = "2022-11-28";
const DEFAULT_GEMINI_ACTIONED_LABEL = "all-gemini-feedback-actioned";
const DEFAULT_READY_FOR_REVIEW_LABEL = "ready-for-review";

/** Hidden marker so we do not spam duplicate triage comments on reruns. */
const TRIAGE_COMMENT_MARKER = "<!-- pr-ci-gemini-triage -->";

const REVIEW_THREADS_QUERY = `
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
const MERGE_STATE_QUERY = `
query ($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      mergeable
      mergeStateStatus
    }
  }
}
`;

function parseArgs(argv) {
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

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * If no token in env, try `gh auth token` (matches pr-claude-triage.sh behaviour).
 */
function ensureGithubTokenFromGhCli() {
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) return;
  try {
    const t = execSync("gh auth token", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (t) {
      process.env.GITHUB_TOKEN = t;
    }
  } catch {
    /* getToken will throw below */
  }
}

function getToken() {
  const t = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!t) {
    throw new Error(
      "GitHub token missing: set GITHUB_TOKEN or GH_TOKEN, or run `gh auth login` so `gh auth token` works.",
    );
  }
  return t;
}

function geminiBotSet() {
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
function getGeminiActionedLabel() {
  const v = process.env.GEMINI_ACTIONED_LABEL;
  if (v === "") return null;
  const name = (v != null && v !== "" ? v : DEFAULT_GEMINI_ACTIONED_LABEL).trim();
  return name || null;
}

/**
 * Label applied when a PR is in the "ready to review" triage state (and removed when not).
 * `PR_TRIAGE_READY_FOR_REVIEW_LABEL` empty = off; unset = `ready-for-review` unless `--no-ready-for-review-label`.
 * @param {{ noReadyForReviewLabel?: boolean }} [args]
 */
function getReadyForReviewLabelName(args) {
  if (args?.noReadyForReviewLabel) return null;
  const v = process.env.PR_TRIAGE_READY_FOR_REVIEW_LABEL;
  if (v === "") return null;
  if (v != null && v !== "") {
    return v.trim() || null;
  }
  return DEFAULT_READY_FOR_REVIEW_LABEL;
}

/**
 * @param {string} gitCwd
 * @param {string[]} args
 */
function gitInRepo(gitCwd, args) {
  return execFileSync("git", args, { cwd: gitCwd, encoding: "utf8" }).trim();
}

/**
 * @param {string} gitCwd
 */
function isInsideGitWorkTree(gitCwd) {
  try {
    return gitInRepo(gitCwd, ["rev-parse", "--is-inside-work-tree"]) === "true";
  } catch {
    return false;
  }
}

/**
 * @param {string} gitCwd
 * @param {string} owner
 * @param {string} repo
 */
function originRemoteMatchesRepository(gitCwd, owner, repo) {
  try {
    const url = gitInRepo(gitCwd, ["remote", "get-url", "origin"]);
    const s = String(url);
    if (!s) return false;
    const o = owner.toLowerCase();
    const r = repo.toLowerCase();
    const m = s.match(/[:/]([^/]+)\/([^/.\s]+?)(?:\.git)?\s*$/i);
    return Boolean(m) && m[1].toLowerCase() === o && m[2].toLowerCase() === r;
  } catch {
    /* not a clone or no origin */
  }
  return false;
}

/**
 * @returns {boolean}
 */
function shouldUseLocalGitForRetrigger() {
  const e = (process.env.PR_TRIAGE_USE_LOCAL_GIT ?? "").trim();
  if (!e) return false;
  return e === "1" || e.toLowerCase() === "true" || e.toLowerCase() === "yes" || e.toLowerCase() === "on";
}

/**
 * Pushes the empty commit on `branchName` in `gitCwd`, then runs `git checkout -` in `finally` so
 * the previous checked-out ref is restored (e.g. after switching from `main` to a PR head).
 * @param {string} gitCwd
 * @param {string} branchName
 * @param {string} message
 * @returns {Promise<
 *   { ok: true, new_head_sha: string, previous_sha: string, via: "local" } | { ok: false, detail: string }
 * >}
 */
async function pushEmptyCommitForCiRetriggerWithLocalGit(gitCwd, branchName, message) {
  if (!isInsideGitWorkTree(gitCwd)) {
    return { ok: false, detail: "not a git work tree" };
  }
  let statusOut = "";
  try {
    statusOut = gitInRepo(gitCwd, ["status", "--porcelain"]);
  } catch (e) {
    return { ok: false, detail: `git status: ${(e && e.message) || e}` };
  }
  if (String(statusOut).trim() !== "") {
    return {
      ok: false,
      detail: "working tree is not clean (clear or unset PR_TRIAGE_USE_LOCAL_GIT to use the API instead)",
    };
  }

  let didSwitchToRetriggerBranch = false;

  const run = (/** @type {() => void} */ fn) => {
    try {
      fn();
    } catch (e) {
      throw new Error((e && e.message) || String(e));
    }
  };

  const safeCheckoutDash = () => {
    if (!didSwitchToRetriggerBranch) return;
    try {
      gitInRepo(gitCwd, ["checkout", "-"]);
    } catch {
      /* best-effort restore to the ref you were on before the switch */
    }
  };

  try {
    run(() => {
      gitInRepo(gitCwd, ["fetch", "origin", branchName]);
    });

    let tipBefore;
    try {
      tipBefore = gitInRepo(gitCwd, ["rev-parse", `remotes/origin/${branchName}`]);
    } catch (e) {
      throw new Error(
        `could not read origin/${branchName} after fetch: ${(e && e.message) || e}`,
      );
    }

    /* Stay aligned with the remote ref that CI runs on. */
    run(() => {
      gitInRepo(gitCwd, ["switch", "-C", branchName, `remotes/origin/${branchName}`]);
    });
    didSwitchToRetriggerBranch = true;

    run(() => {
      gitInRepo(gitCwd, ["commit", "--allow-empty", "-m", message]);
    });

    const new_head_sha = gitInRepo(gitCwd, ["rev-parse", "HEAD"]);

    run(() => {
      gitInRepo(gitCwd, ["push", "origin", branchName]);
    });

    return {
      ok: true,
      new_head_sha,
      /* eslint-disable camelcase */ previous_sha: tipBefore, /* tip before the empty commit */
      via: "local",
    };
  } catch (e) {
    if (didSwitchToRetriggerBranch) {
      try {
        gitInRepo(gitCwd, ["reset", "--hard", `remotes/origin/${branchName}`]);
      } catch {
        /* leave state for the user; still try checkout - */
      }
    }
    return { ok: false, detail: e && e.message ? String(e.message) : String(e) };
  } finally {
    safeCheckoutDash();
  }
}

function prHasGeminiActionedLabel(pr) {
  const need = getGeminiActionedLabel();
  if (!need) return false;
  const labels = pr?.labels;
  if (!Array.isArray(labels)) return false;
  return labels.some((l) => l && l.name === need);
}

/**
 * Unresolved API threads that still should block our rollup, given optional trust label.
 */
function geminiUnresolvedBlocksTriage(row) {
  const n = row.gemini_unresolved_count ?? 0;
  if (n <= 0) return false;
  if (row.gemini_feedback_actioned_label_set) return false;
  return true;
}

function geminiUnresolvedTriageStatePhrase(row) {
  const n = row.gemini_unresolved_count ?? 0;
  if (n <= 0) return "no open Gemini triage";
  if (row.gemini_feedback_actioned_label_set) {
    return `triage not blocking (\`${getGeminiActionedLabel() ?? "all-gemini-feedback-actioned"}\` label)`;
  }
  return `open Gemini triage: ${n} thread(s)`;
}

function threadHasGeminiComment(thread, bots) {
  const nodes = thread?.comments?.nodes ?? [];
  return nodes.some((c) => c?.author?.login && bots.has(c.author.login));
}

async function githubRest(path) {
  const token = getToken();
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub REST ${res.status} ${path}: ${text.slice(0, 500)}`);
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function githubRestPost(path, jsonBody) {
  const token = getToken();
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(jsonBody),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub REST POST ${res.status} ${path}: ${text.slice(0, 600)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function githubRestPatch(path, jsonBody) {
  const token = getToken();
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(jsonBody),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub REST PATCH ${res.status} ${path}: ${text.slice(0, 600)}`);
  }
  return text ? JSON.parse(text) : null;
}

/**
 * POST helper that does not throw — used when creating PRs (422 = already exists, etc.).
 */
async function githubRestPostStatus(path, jsonBody) {
  const token = getToken();
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(jsonBody),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, json: parsed, text };
}

/**
 * @returns {Promise<{ ok: boolean, status: number, text: string }>}
 */
async function githubRestDelete(path) {
  const token = getToken();
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
    },
  });
  const text = await res.text();
  if (res.status === 204 || res.status === 200) {
    return { ok: true, status: res.status, text: "" };
  }
  return { ok: false, status: res.status, text: text.slice(0, 500) };
}

/**
 * Remove `refs/heads/{branchName}` (same ref encoding as empty-commit retrigger).
 * @returns {Promise<{ ok: boolean, status: number, text: string }>}
 */
async function deleteRemoteBranchRef(owner, repo, branchName) {
  const refPath = `heads/${branchName}`;
  const refEnc = encodeURIComponent(refPath);
  return githubRestDelete(`/repos/${owner}/${repo}/git/refs/${refEnc}`);
}

async function fetchRepositoryDefaultBranch(owner, repo) {
  const envBase = process.env.PR_TRIAGE_BASE_BRANCH?.trim();
  if (envBase) return envBase;
  const data = await githubRest(`/repos/${owner}/${repo}`);
  return data.default_branch || "main";
}

/** Only open orphan PRs when the branch's first unique commit (vs base) is within this window. */
const ORPHAN_PR_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function issueNumberFromClaudeBranchName(branchName) {
  const m = /^claude\/issue-(\d+)-/i.exec(branchName);
  return m ? parseInt(m[1], 10) : null;
}

function truncateTitle(s, maxLen) {
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

/**
 * Compare `base`...`head` (see GitHub compare API). Returns null on failure.
 * After a **squash** merge, `head` is often still *ahead* in unique commits, so a second PR
 * from the same branch can show a full diff to `main` even though the work was already merged
 * (different commit history). `isHeadShaAlreadyMergedInPr` catches the duplicate case.
 */
async function fetchCompareBaseHead(owner, repo, baseBranch, headBranch) {
  const compareRef = `${encodeURIComponent(baseBranch)}...${encodeURIComponent(headBranch)}`;
  const path = `/repos/${owner}/${repo}/compare/${compareRef}`;
  try {
    const data = await githubRest(path);
    const commits = data.commits ?? [];
    const first = commits[0] ?? data.head_commit;
    const inner = first?.commit;
    const msg = inner?.message;
    const firstLine = typeof msg === "string" ? msg.split("\n")[0].trim() : null;
    const firstCommitAt =
      inner?.committer?.date || inner?.author?.date || null;
    return {
      ahead_by: data.ahead_by ?? 0,
      behind_by: data.behind_by ?? 0,
      status: data.status ?? "",
      total_commits: data.total_commits ?? 0,
      file_count: (data.files ?? []).length,
      first_line: firstLine,
      first_commit_at: firstCommitAt,
    };
  } catch {
    return null;
  }
}

/**
 * A merged (into base) PR already used this head ref and tip SHA; opening another is duplicate spam.
 * True when a closed **merged** PR has `head.sha ===` current remote tip and same base.
 */
async function isHeadShaAlreadyMergedInPr(owner, repo, baseBranch, headBranch, headSha) {
  if (!headSha) return { merged: false, number: null };
  const headParam = encodeURIComponent(`${owner}:${headBranch}`);
  const first = `https://api.github.com/repos/${owner}/${repo}/pulls?head=${headParam}&state=closed&per_page=30&sort=updated&direction=desc`;
  let url = first;
  while (url) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${getToken()}`,
        "X-GitHub-Api-Version": API_VERSION,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      return { merged: false, number: null };
    }
    let pulls;
    try {
      pulls = JSON.parse(text);
    } catch {
      return { merged: false, number: null };
    }
    if (!Array.isArray(pulls)) {
      return { merged: false, number: null };
    }
    for (const pr of pulls) {
      if (pr == null) continue;
      if (!pr.merged_at) continue;
      if (pr.base?.ref && pr.base.ref !== baseBranch) continue;
      if (pr.head?.ref && pr.head.ref !== headBranch) continue;
      if (pr.head?.sha === headSha) {
        return { merged: true, number: pr.number ?? null };
      }
    }
    url = parseNextLink(res.headers.get("Link"));
  }
  return { merged: false, number: null };
}

function isFirstCommitWithinWeek(isoDate) {
  if (!isoDate) return false;
  const t = new Date(isoDate).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= ORPHAN_PR_MAX_AGE_MS;
}

async function fetchIssueTitle(owner, repo, issueNum) {
  try {
    const issue = await githubRest(`/repos/${owner}/${repo}/issues/${issueNum}`);
    if (typeof issue.title === "string" && issue.title.trim()) {
      return issue.title.trim();
    }
  } catch {
    /* 404 or no access */
  }
  return null;
}

/**
 * PR title: `#N {issue title}` when the branch names an issue; avoids placeholder commit lines like "Trigger CI".
 */
function buildOrphanPrTitle(issueNum, issueTitle, compareFirstLine, branch) {
  const titleMax = 240;
  if (issueNum != null && issueTitle) {
    return truncateTitle(`#${issueNum} ${issueTitle}`, titleMax);
  }
  if (issueNum != null) {
    return truncateTitle(`#${issueNum}`, titleMax);
  }
  const line = compareFirstLine?.trim() || "";
  if (line && !/^trigger ci$/i.test(line)) {
    return truncateTitle(line, titleMax);
  }
  return truncateTitle(`Claude: ${branch}`, titleMax);
}

/**
 * When orphan PR creation is skipped because the branch is done, optionally delete `refs/heads/...`.
 * @param {{ dryRun: boolean, deleteMergedClaudeBranches: boolean }} options
 */
async function maybeDeleteRemoteClaudeBranchAfterMergeCleanup(owner, repo, branch, options) {
  if (!options.deleteMergedClaudeBranches) {
    return { wouldDelete: false, deleted: false, deleteError: null };
  }
  if (options.dryRun) {
    return { wouldDelete: true, deleted: false, deleteError: null };
  }
  const r = await deleteRemoteBranchRef(owner, repo, branch);
  if (r.ok) {
    return { wouldDelete: false, deleted: true, deleteError: null };
  }
  return {
    wouldDelete: false,
    deleted: false,
    deleteError: r.text || `HTTP ${r.status}`,
  };
}

function deleteResultFields(del) {
  return {
    remote_branch_delete_would: del.wouldDelete,
    remote_branch_deleted: del.deleted,
    remote_branch_delete_error: del.deleteError,
  };
}

/**
 * Opens GitHub pull requests for orphan claude/* branches (same repo).
 * @param {{ dryRun: boolean, deleteMergedClaudeBranches: boolean }} options
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function createPullRequestsForOrphanBranches(owner, repo, orphans, baseBranch, options) {
  const results = [];

  for (const o of orphans) {
    const branch = o.name;
    const issueNum = issueNumberFromClaudeBranchName(branch);
    const tip = o.sha ?? null;

    const comp = await fetchCompareBaseHead(owner, repo, baseBranch, branch);

    if (comp == null) {
      results.push({
        branch,
        action: "skipped_could_not_verify_branch_age",
        detail: `Compare ${baseBranch}...${branch} failed (no data)`,
      });
      continue;
    }

    if (comp.ahead_by === 0 || comp.status === "identical") {
      const del = await maybeDeleteRemoteClaudeBranchAfterMergeCleanup(owner, repo, branch, options);
      results.push({
        branch,
        action: "skipped_nothing_to_merge",
        detail: `Head is not ahead of \`${baseBranch}\` (ahead_by=${comp.ahead_by} status=${comp.status}); no PR needed`,
        ...deleteResultFields(del),
      });
      continue;
    }

    if (tip) {
      const { merged, number: mergedPrNum } = await isHeadShaAlreadyMergedInPr(
        owner,
        repo,
        baseBranch,
        branch,
        tip,
      );
      if (merged) {
        const del = await maybeDeleteRemoteClaudeBranchAfterMergeCleanup(owner, repo, branch, options);
        results.push({
          branch,
          action: "skipped_head_sha_already_merged",
          head_sha: tip,
          into_pr: mergedPrNum,
          detail:
            `This branch tip was already merged (e.g. PR #${mergedPrNum ?? "?"}). ` +
            `After squash merge, delete \`${branch}\` on the remote or push new commits so the next PR is not a duplicate. ` +
            `A new open PR with the same tip can still look like it has a diff to \`${baseBranch}\` because the squash is not a parent of the branch history.`,
          ...deleteResultFields(del),
        });
        continue;
      }
    }

    const firstCommitAt = comp.first_commit_at;
    if (!firstCommitAt) {
      results.push({
        branch,
        action: "skipped_could_not_verify_branch_age",
        detail: `Could not read first commit date for ${baseBranch}...${branch}`,
      });
      continue;
    }

    if (!isFirstCommitWithinWeek(firstCommitAt)) {
      results.push({
        branch,
        action: "skipped_branch_too_old",
        first_commit_at: firstCommitAt,
        detail: `First commit vs ${baseBranch} is older than 7 days (${firstCommitAt})`,
      });
      continue;
    }

    let issueTitle = null;
    if (issueNum != null) {
      issueTitle = await fetchIssueTitle(owner, repo, issueNum);
    }

    const title = buildOrphanPrTitle(issueNum, issueTitle, comp.first_line ?? null, branch);

    let body = `Opened automatically by **pr-claude-triage** for branch \`${branch}\`.\n\n`;
    if (issueNum != null) {
      body += `Tracks issue: #${issueNum}\n\n`;
    }
    body += `First commit on this branch (vs \`${baseBranch}\`): ${firstCommitAt}\n\n`;
    body += `Head commit: \`${(o.sha ?? "").slice(0, 7)}\``;

    if (options.dryRun) {
      results.push({
        branch,
        action: "dry_run_would_create",
        title,
        base: baseBranch,
        first_commit_at: firstCommitAt,
      });
      continue;
    }

    const { ok, status, json, text } = await githubRestPostStatus(`/repos/${owner}/${repo}/pulls`, {
      title,
      head: branch,
      base: baseBranch,
      body,
    });

    if (ok && json?.html_url) {
      results.push({
        branch,
        action: "created",
        number: json.number,
        url: json.html_url,
        title,
        first_commit_at: firstCommitAt,
      });
      continue;
    }

    const combined = `${text || ""} ${json?.message || ""}`;
    if (
      status === 422 &&
      (/pull request already exists/i.test(combined) || /already exists/i.test(combined))
    ) {
      results.push({
        branch,
        action: "skipped_already_exists",
        detail: (json?.errors?.[0]?.message || text || "").slice(0, 300),
      });
      continue;
    }

    results.push({
      branch,
      action: "failed",
      detail: (text || json?.message || `HTTP ${status}`).slice(0, 500),
    });
  }

  return results;
}

/**
 * Workflow run `status` values while a run is still in-flight before completion.
 * (Rarely, the API may surface `action_required` as a status — see GitHub REST enum.)
 */
const FORK_WORKFLOW_WAIT_STATUSES = new Set([
  "waiting",
  "pending",
  "requested",
  "action_required",
]);

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

async function listWorkflowRunsForHeadSha(owner, repo, headSha) {
  const runs = [];
  let url = `https://api.github.com/repos/${owner}/${repo}/actions/runs?head_sha=${encodeURIComponent(headSha)}&per_page=100`;
  const token = getToken();
  while (url) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": API_VERSION,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`workflow runs ${res.status}: ${text.slice(0, 400)}`);
    }
    const data = JSON.parse(text);
    runs.push(...(data.workflow_runs || []));
    url = parseNextLink(res.headers.get("Link"));
  }
  return runs;
}

/** True while a Actions run for `.github/workflows/claude.yml` is still running on this SHA. */
const WORKFLOW_RUN_ACTIVE_STATUSES = new Set([
  "queued",
  "in_progress",
  "waiting",
  "pending",
  "requested",
]);

function isClaudeCodeWorkflowFile(run) {
  const p = String(run.path || "").replace(/\\/g, "/");
  return /(^|\/)claude\.ya?ml$/i.test(p);
}

async function hasActiveClaudeCodeWorkflow(owner, repo, headSha) {
  const runs = await listWorkflowRunsForHeadSha(owner, repo, headSha);
  return runs.some(
    (r) => isClaudeCodeWorkflowFile(r) && WORKFLOW_RUN_ACTIVE_STATUSES.has(r.status),
  );
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

const CI_RETRIGGER_COMMIT_MESSAGE = "chore(ci): retrigger workflows (pr-claude-triage)";

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
async function processForkWorkflowApprovals(owner, repo, headSha, headBranchName, options) {
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

const readyForReviewLabelCreateCache = new Set();

/**
 * Create the label in the repository if missing (attach requires the label to exist).
 * @param {string} labelName
 */
async function ensureRepositoryLabelExistsForTriage(owner, repo, labelName) {
  const key = `${owner}/${repo}/${labelName}`;
  if (readyForReviewLabelCreateCache.has(key)) return;
  try {
    await githubRestPost(`/repos/${owner}/${repo}/labels`, {
      name: labelName,
      color: "5319E7",
      description: "PR is ready for review (pr-claude-triage)",
    });
  } catch (e) {
    const m = (e && e.message) || String(e);
    if (!/422|Validation Failed|already exists/i.test(m)) {
      throw e;
    }
  }
  readyForReviewLabelCreateCache.add(key);
}

/**
 * Add/remove the "ready for review" label to match the triage state (ready = no blockers, CI not in flight).
 * @param {string} labelName
 * @param {{ shouldHave: boolean, labels: Array<{ name?: string } | null | undefined>, dryRun: boolean }} ctx
 * @returns {Promise<"disabled" | "unchanged" | "added" | "removed" | "dry_run_would_add" | "dry_run_would_remove" | "error">}
 */
async function ensurePrReadyForReviewLabel(owner, repo, issueNumber, labelName, ctx) {
  if (!labelName) return "disabled";
  const { shouldHave, labels, dryRun } = ctx;
  const has = (labels ?? []).some((l) => l && l.name === labelName);
  if (shouldHave && !has) {
    if (dryRun) return "dry_run_would_add";
    try {
      await ensureRepositoryLabelExistsForTriage(owner, repo, labelName);
      await githubRestPost(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, { labels: [labelName] });
    } catch (e) {
      console.error(`[ready-for-review label] add failed for #${issueNumber}: ${(e && e.message) || e}`);
      return "error";
    }
    return "added";
  }
  if (!shouldHave && has) {
    if (dryRun) return "dry_run_would_remove";
    const enc = encodeURIComponent(labelName);
    const { ok, status, text } = await githubRestDelete(
      `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${enc}`,
    );
    if (!ok) {
      console.error(
        `[ready-for-review label] remove failed for #${issueNumber}: http=${status} ${(text || "").slice(0, 200)}`,
      );
      return "error";
    }
    return "removed";
  }
  return "unchanged";
}

async function fetchIssueComments(owner, repo, issueNumber) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100&sort=updated&direction=desc`;
  return fetchAllPages(url);
}

function issueHasTriageMarker(comments) {
  return (comments ?? []).some((c) => typeof c.body === "string" && c.body.includes(TRIAGE_COMMENT_MARKER));
}

function buildTriageCommentBody(row) {
  const lines = [
    TRIAGE_COMMENT_MARKER,
    "",
    "@claude **Triage automation:** please address **all** of the following before merge:",
    "",
  ];

  let i = 1;
  const hasCiFailures = (row.failures ?? 0) > 0;
  const hasConflict = row.conflict === 1;
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

/**
 * Skip duplicate triage comments only while Claude Code workflow is still running on this commit.
 * If the marker exists but Claude is idle, post again with updated instructions.
 *
 * @returns {{ action: string, url?: string, detail?: string }}
 */
async function maybePostTriageComment(owner, repo, prNumber, headSha, row, ping, options) {
  if (!claudeTriagePingRecommended(row)) {
    return { action: "none" };
  }
  if (!ping.triage_ping_recommended) {
    return { action: "none" };
  }
  const comments = await fetchIssueComments(owner, repo, prNumber);
  const hasMarker = issueHasTriageMarker(comments);

  if (hasMarker && !options.forceComment) {
    const activeClaude = await hasActiveClaudeCodeWorkflow(owner, repo, headSha);
    if (activeClaude) {
      if (options.dryRun) {
        return {
          action: "dry_run_skipped",
          detail:
            "Would skip: triage marker exists and Claude Code workflow is still running on this commit.",
        };
      }
      return {
        action: "skipped",
        detail:
          "Triage marker exists and Claude Code (claude.yml) is still in progress — not posting a duplicate comment.",
      };
    }
  }

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

async function fetchAllPages(firstUrl) {
  const items = [];
  let url = firstUrl;
  while (url) {
    const token = getToken();
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": API_VERSION,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`GitHub REST ${res.status} ${url}: ${text.slice(0, 500)}`);
    }
    const page = JSON.parse(text);
    if (Array.isArray(page)) {
      items.push(...page);
    } else {
      items.push(page);
    }
    url = parseNextLink(res.headers.get("Link"));
  }
  return items;
}

async function graphql(query, variables) {
  const token = getToken();
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`GraphQL HTTP ${res.status}: ${JSON.stringify(body).slice(0, 800)}`);
  }
  if (body.errors?.length) {
    throw new Error(`GraphQL: ${JSON.stringify(body.errors)}`);
  }
  return body.data;
}

async function listOpenPulls(owner, repo) {
  const base = `/repos/${owner}/${repo}/pulls?state=open&per_page=100&sort=updated&direction=desc`;
  return fetchAllPages(`https://api.github.com${base}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string | null | undefined} state
 * @returns {boolean}
 */
function isMergeableStateRestUnknown(state) {
  const s = String(state ?? "").toLowerCase();
  return !s || s === "unknown";
}

/**
 * @returns {Promise<{ mergeable: string, mergeStateStatus: string } | null>}
 */
async function fetchPullRequestMergeStateGraphql(owner, repo, prNumber) {
  const data = await graphql(MERGE_STATE_QUERY, {
    owner,
    name: repo,
    number: prNumber,
  });
  const p = data?.repository?.pullRequest;
  if (!p) {
    return null;
  }
  if (p.mergeable == null) {
    return null;
  }
  return {
    mergeable: String(p.mergeable),
    mergeStateStatus: p.mergeStateStatus != null ? String(p.mergeStateStatus) : "UNKNOWN",
  };
}

/**
 * Map GraphQL merge state onto REST-style fields. REST often leaves `mergeable: null` while the UI
 * already shows conflicts; GraphQL reports CONFLICTING / mergeStateStatus DIRTY reliably.
 * @param {Record<string, unknown>} pr
 * @param {{ mergeable: string, mergeStateStatus: string } | null} gql
 */
function applyGraphqlMergeableToPr(pr, gql) {
  if (!gql) {
    return { ...pr, mergeability_indeterminate: true };
  }
  const m = gql.mergeable;
  const s = gql.mergeStateStatus || "UNKNOWN";

  if (m === "CONFLICTING" || s === "DIRTY") {
    return {
      ...pr,
      mergeable: false,
      mergeable_state: "dirty",
      mergeability_indeterminate: false,
    };
  }

  if (m === "MERGEABLE") {
    return {
      ...pr,
      mergeable: true,
      mergeable_state: s === "UNKNOWN" ? "unknown" : s.toLowerCase(),
      mergeability_indeterminate: false,
    };
  }

  /* m === "UNKNOWN" (GraphQL) */
  if (s === "DIRTY") {
    return {
      ...pr,
      mergeable: false,
      mergeable_state: "dirty",
      mergeability_indeterminate: false,
    };
  }

  return {
    ...pr,
    mergeability_indeterminate: true,
  };
}

/**
 * Refresh mergeability from GET /pulls/{number} (never trust list PR merge fields — they are often stale).
 * GitHub may return mergeable: null while mergeability is still computing; poll until it becomes a boolean
 * or we hit a cap. If `mergeable` is still null (or mergeable_state is unknown), use GraphQL — REST can stay
 * UNKNOWN while the PR page already shows conflicts, which would otherwise yield a false "no conflict".
 */
async function refreshPullMergeStatus(owner, repo, pr) {
  const maxAttempts = 12;
  const delayMs = 1000;

  let current = { ...pr };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const fresh = await githubRest(`/repos/${owner}/${repo}/pulls/${pr.number}`);
      current = { ...current, ...fresh };
    } catch {
      return current;
    }

    /* `mergeable` can stay null while `mergeable_state` is already `dirty` (conflicts). Do not spin 12×. */
    if (String(current.mergeable_state ?? "").toLowerCase() === "dirty") {
      return current;
    }
    if (current.mergeable === false) {
      return current;
    }
    if (current.mergeable === true) {
      return current;
    }

    if (attempt < maxAttempts - 1) {
      await sleep(delayMs);
    }
  }

  const needsGraphql =
    current.mergeable == null || isMergeableStateRestUnknown(current.mergeable_state);

  if (needsGraphql) {
    try {
      const gqlState = await fetchPullRequestMergeStateGraphql(owner, repo, pr.number);
      current = applyGraphqlMergeableToPr(current, gqlState);
    } catch (e) {
      console.warn(
        `[warn] GraphQL merge state fallback failed for PR #${pr.number}: ${(e && e.message) || e}`,
      );
      if (current.mergeable == null && isMergeableStateRestUnknown(current.mergeable_state)) {
        current = { ...current, mergeability_indeterminate: true };
      }
    }
  }

  return current;
}

/**
 * Conflicts: mergeable_state "dirty", or mergeable false once GitHub has finished computing.
 */
function hasMergeConflict(pr) {
  const state = String(pr.mergeable_state ?? "").toLowerCase();
  if (state === "dirty") {
    return true;
  }
  return pr.mergeable === false;
}

/**
 * Remote refs under refs/heads/claude (Claude Code branches). 404 → no matching branches.
 */
async function listClaudeGitRefs(owner, repo) {
  const token = getToken();
  const path = `/repos/${owner}/${repo}/git/matching-refs/heads/claude`;
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
    },
  });
  if (res.status === 404) {
    return [];
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`git matching-refs ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = JSON.parse(text);
  if (Array.isArray(data)) {
    return data;
  }
  if (data?.ref) {
    return [data];
  }
  return [];
}

/**
 * Branches named claude/... that exist on the remote but are not the head of any open PR.
 */
function findOrphanClaudeBranches(gitRefs, openHeadRefs) {
  const orphans = [];
  const prefix = "refs/heads/";
  for (const item of gitRefs) {
    const ref = item?.ref;
    if (typeof ref !== "string" || !ref.startsWith(prefix)) continue;
    const name = ref.slice(prefix.length);
    if (!name.startsWith("claude/")) continue;
    if (openHeadRefs.has(name)) continue;
    orphans.push({
      name,
      sha: item.object?.sha ?? null,
    });
  }
  orphans.sort((a, b) => a.name.localeCompare(b.name));
  return orphans;
}

function summarizeCheckRuns(checkRuns) {
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

async function fetchCheckRunsForSha(owner, repo, sha) {
  // Default `filter=latest` omits many runs (e.g. in-progress — no completed_at). Use `all` to match
  // the PR "Checks" tab, including concurrent push + pull_request jobs.
  const path = `/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100&filter=all`;
  const first = `https://api.github.com${path}`;
  const token = getToken();
  const runs = [];
  let url = first;
  while (url) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": API_VERSION,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`check-runs ${res.status}: ${text.slice(0, 400)}`);
    }
    const data = JSON.parse(text);
    runs.push(...(data.check_runs || []));
    url = parseNextLink(res.headers.get("Link"));
  }
  return runs;
}

/**
 * Unresolved Gemini threads that still block triage.
 *
 * GitHub keeps `isResolved: false` on threads even after the commented line is fixed, until
 * someone clicks **Resolve** in the UI. When the diff moves, GitHub sets `isOutdated: true`;
 * those threads are **not** counted as blocking — the feedback was superseded by newer commits.
 */
async function fetchUnresolvedGeminiThreads(owner, repo, prNumber, bots) {
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

function formatUnknown(val) {
  if (val === null || val === undefined) return "UNKNOWN";
  return String(val);
}

/**
 * When to recommend a triage ping: CI failure, merge conflict, open Gemini threads, or workflows still awaiting approval.
 * (Console / exit-code rollup — includes workflow approval backlog.)
 */
function triagePingRecommended(row) {
  const reasons = [];
  if (row.failures > 0) {
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
 * Whether to post an @claude triage comment. Workflow approval is done by this script via the token
 * (`postApproveWorkflowRun`); Claude cannot approve Actions runs, so we never include that in the bot ping.
 */
function claudeTriagePingRecommended(row) {
  if ((row.failures ?? 0) > 0) return true;
  if (row.conflict === 1) return true;
  if (row.mergeability_indeterminate) return true;
  if (geminiUnresolvedBlocksTriage(row)) return true;
  return false;
}

function formatDecisionLine(prNumber, ping, row) {
  if (!ping.triage_ping_recommended) {
    const inFlight = (row?.queued_or_running ?? 0) > 0;
    if (inFlight) {
      return `[decision] No triage ping for PR #${prNumber}: ${row.queued_or_running} check run(s) still queued or in progress — wait for CI to finish before treating this as ready. No completed check failures, merge conflict flag clear, Gemini: ${geminiUnresolvedTriageStatePhrase(row)}, workflow approval gate clear.`;
    }
    if (
      (row.gemini_unresolved_count ?? 0) > 0 &&
      row.gemini_feedback_actioned_label_set
    ) {
      const name = getGeminiActionedLabel() ?? "all-gemini-feedback-actioned";
      return `[decision] No triage ping for PR #${prNumber}: no completed check failures, merge/clear, workflows not blocked. Open Gemini thread(s) on the diff, but \`${name}\` is set — we trust (not triage-blocking).`;
    }
    return `[decision] No triage ping for PR #${prNumber}: CI rollup looks healthy (no completed failures), merge conflict flag clear, no unresolved Gemini inline threads, workflows not blocked on approval.`;
  }
  const joined = ping.triage_ping_reasons.join("; ");
  return `[decision] Triage ping recommended for PR #${prNumber}: ${joined}.`;
}

function createEmptySummary() {
  return {
    reworkCommentPosted: [],
    reworkWouldPost: [],
    reworkCommentSkipped: [],
    workflowApprovalPending: [],
    readyToReview: [],
    /** PRs with no triage blockers but check runs still queued/running (not "ready" yet) */
    ciInProgress: [],
    readyForReviewLabelAdded: [],
    readyForReviewLabelRemoved: [],
  };
}

function printConsoleSummary(summary, orphanClaudeBranches) {
  const orphans = orphanClaudeBranches ?? [];
  const prLine = (p) => `   - #${p.number} ${p.title} — ${p.url}`;
  console.log("=== Summary ===");
  console.log("");
  console.log("1. Requires rework (comment triggered)");
  if (summary.reworkCommentPosted.length === 0 && summary.reworkWouldPost.length === 0) {
    console.log("   (none)");
  } else {
    for (const p of summary.reworkCommentPosted) {
      console.log(prLine(p));
    }
    for (const p of summary.reworkWouldPost) {
      console.log(
        `   - #${p.number} ${p.title} — ${p.url} (dry-run: would post)`,
      );
    }
  }
  console.log("");
  console.log("2. Requires rework (comment skipped)");
  if (summary.reworkCommentSkipped.length === 0) {
    console.log("   (none)");
  } else {
    for (const p of summary.reworkCommentSkipped) {
      console.log(prLine(p));
      if (p.detail) {
        console.log(`     ${p.detail}`);
      }
    }
  }
  console.log("");
  console.log(
    "3. Workflow approval still pending (script tried API; you may need **Approve workflows** in the GitHub UI)",
  );
  if (summary.workflowApprovalPending.length === 0) {
    console.log("   (none)");
  } else {
    for (const p of summary.workflowApprovalPending) {
      console.log(prLine(p));
    }
  }
  console.log("");
  console.log('4. CI in progress (not ready to treat as "all clear" yet)');
  if (summary.ciInProgress.length === 0) {
    console.log("   (none)");
  } else {
    for (const p of summary.ciInProgress) {
      console.log(prLine(p));
    }
  }
  console.log("");
  console.log("5. Ready to review (no triage blockers, no checks queued/in progress)");
  if (summary.readyToReview.length === 0) {
    console.log("   (none)");
  } else {
    for (const p of summary.readyToReview) {
      console.log(prLine(p));
    }
  }
  console.log("");
  const rfa = summary.readyForReviewLabelAdded?.length ?? 0;
  const rfr = summary.readyForReviewLabelRemoved?.length ?? 0;
  if (rfa + rfr > 0) {
    console.log("5b. ready-for-review label (this run)");
    if (rfa > 0) {
      console.log(`   added (${rfa}):`);
      for (const p of summary.readyForReviewLabelAdded) {
        console.log(prLine(p));
      }
    }
    if (rfr > 0) {
      console.log(`   removed (${rfr}):`);
      for (const p of summary.readyForReviewLabelRemoved) {
        console.log(prLine(p));
      }
    }
    console.log("");
  }
  console.log("6. Remote claude/* branches with no open PR");
  if (orphans.length === 0) {
    console.log("   (none — every claude/* head on the remote has an open PR, or there are no claude/* branches)");
  } else {
    for (const o of orphans) {
      const shaBit = o.sha ? ` @ ${String(o.sha).slice(0, 7)}` : "";
      console.log(`   - ${o.name}${shaBit}`);
    }
  }
  console.log("");
}

async function main() {
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
  --fail-on-triage-ping          Exit 2 if any PR recommends a triage ping (CI, conflict, or Gemini)
  --dry-run                      Do not post comments, approve workflows, push empty commits, open orphan PRs, or delete remote branches
  --force-comment                Post even if a Claude workflow is still running (overrides duplicate skip)
  --no-approve-workflows         Do not POST workflow approvals (still counts runs awaiting approval)
  --no-empty-commit-retrigger    If runs stay blocked after approve API, do not push an empty commit to re-trigger CI
  --no-ready-for-review-label    Do not add/remove the ready-for-review triage label on PRs
  --no-create-orphan-prs         List orphan claude/* branches only; do not open PRs for them
  --delete-merged-claude-branches  When orphan PR is skipped (already merged / already in base), delete the remote claude/* branch
  -h, --help                     This help

Default: approves workflow runs where the API allows; if runs stay blocked on the same SHA, pushes an
empty git commit on the PR branch to re-trigger CI. Then rolls up CI. Opens PRs
for orphan claude/* branches when the branch's first commit vs the base is within 7 days; PR title is
#N plus issue title when the branch is claude/issue-N-*. Base = default branch (PR_TRIAGE_BASE_BRANCH).
Posts @claude triage comments only for CI / merge / Gemini. Token: **Contents** (write, for empty commits), **Actions** (read/write), **Pull requests**, **Issues**.

Environment:
  GITHUB_TOKEN or GH_TOKEN
  PR_TRIAGE_BASE_BRANCH   Base branch for orphan claude/* PRs (default: repo default branch from API)
  PR_TRIAGE_USE_LOCAL_GIT  "1"/"true": use local git in PR_TRIAGE_GIT_CWD (or cwd) for empty CI retrigger
  PR_TRIAGE_GIT_CWD        Repo root for PR_TRIAGE_USE_LOCAL_GIT (default: process cwd; origin must match -R)
  PR_TRIAGE_READY_FOR_REVIEW_LABEL  Label for "ready" PRs; unset = ready-for-review, empty = do not use
  GEMINI_REVIEW_BOTS      comma-separated logins (default: gemini-code-assist)
  GEMINI_ACTIONED_LABEL   PR label name that means Gemini is fully addressed; unset = "all-gemini-feedback-actioned", empty = disable
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
  const readyForReviewLabelName = getReadyForReviewLabelName(args);

  const bots = geminiBotSet();
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

    const wfResult = await processForkWorkflowApprovals(owner, repo, headSha, headRef, {
      dryRun: args.dryRun,
      disabled: args.noApproveWorkflows,
      noEmptyCommitRetrigger: args.noEmptyCommitRetrigger,
      preferLocalGitForEmptyRetrigger,
      gitCwd,
    });

    if (typeof wfResult.workflows_effective_head_sha === "string") {
      headSha = wfResult.workflows_effective_head_sha;
    }

    const checkRuns = await fetchCheckRunsForSha(owner, repo, headSha);
    const ci = summarizeCheckRuns(checkRuns);
    const gemini = await fetchUnresolvedGeminiThreads(owner, repo, prMerge.number, bots);
    const actionedLabel = getGeminiActionedLabel();
    const hasActionedLabel = prHasGeminiActionedLabel(prMerge);

    const row = {
      number: prMerge.number,
      title: prMerge.title,
      branch: prMerge.head?.ref ?? null,
      url: prMerge.html_url,
      mergeable: prMerge.mergeable,
      mergeable_state: prMerge.mergeable_state ?? null,
      mergeability_indeterminate: prMerge.mergeability_indeterminate === true,
      ...wfResult,
      ...ci,
      conflict: hasMergeConflict(prMerge) ? 1 : 0,
      ci_missing: ci.check_runs === 0 ? 1 : 0,
      ...gemini,
      gemini_feedback_actioned_label: actionedLabel,
      gemini_feedback_actioned_label_set: hasActionedLabel,
    };

    const ping = triagePingRecommended(row);
    row.triage_ping_recommended = ping.triage_ping_recommended;
    row.triage_ping_reasons = ping.triage_ping_reasons;
    row.claude_triage_ping_recommended = claudeTriagePingRecommended(row);

    const commentResult = await maybePostTriageComment(owner, repo, prMerge.number, headSha, row, ping, {
      dryRun: args.dryRun,
      forceComment: args.forceComment,
    });
    row.triage_comment_action = commentResult.action;
    row.triage_comment_url = commentResult.url ?? null;
    row.triage_comment_detail = commentResult.detail ?? null;

    const prBrief = {
      number: prMerge.number,
      title: prMerge.title,
      url: prMerge.html_url,
    };
    if (!ping.triage_ping_recommended) {
      if ((row.queued_or_running ?? 0) > 0) {
        summary.ciInProgress.push(prBrief);
      } else {
        summary.readyToReview.push(prBrief);
      }
    } else if (!row.claude_triage_ping_recommended) {
      // e.g. workflows still awaiting approval — handled by token, not @claude
      summary.workflowApprovalPending.push(prBrief);
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

    const shouldHaveReadyForReviewLabel =
      !ping.triage_ping_recommended && (row.queued_or_running ?? 0) === 0;
    const readyLabelAction = await ensurePrReadyForReviewLabel(
      owner,
      repo,
      prMerge.number,
      readyForReviewLabelName,
      {
        shouldHave: shouldHaveReadyForReviewLabel,
        labels: prMerge.labels ?? [],
        dryRun: args.dryRun,
      },
    );
    row.ready_for_review_label = readyLabelAction;
    if (readyLabelAction === "added") {
      summary.readyForReviewLabelAdded.push(prBrief);
    } else if (readyLabelAction === "removed") {
      summary.readyForReviewLabelRemoved.push(prBrief);
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
      console.log(
        `  check_runs=${ci.check_runs} completed_ok=${ci.completed_ok} completed_fail=${ci.completed_fail} skipped=${ci.skipped} cancelled=${ci.cancelled} queued_or_running=${ci.queued_or_running} has_ci=${ci.has_ci} failures=${ci.failures} conflict=${row.conflict} mergeability_indeterminate=${row.mergeability_indeterminate ? 1 : 0} ci_missing=${row.ci_missing}`,
      );
      const labelBit =
        row.gemini_feedback_actioned_label == null
          ? "actioned_label_disabled"
          : row.gemini_feedback_actioned_label;
      console.log(
        `  gemini_unresolved_threads=${row.gemini_unresolved_count} gemini_triage_block=${geminiUnresolvedBlocksTriage(row)} actioned_label="${labelBit}" actioned_label_set=${row.gemini_feedback_actioned_label_set}`,
      );
      console.log(formatDecisionLine(prMerge.number, ping, row));
      if (args.dryRun && wfBefore > 0) {
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
      } else if (args.noApproveWorkflows && wfBefore > 0) {
        console.log(
          `  [action] Workflow approval disabled (--no-approve-workflows); ${wfBefore} run(s) still awaiting approval.`,
        );
      } else if (!args.dryRun && !args.noApproveWorkflows && wfBefore > 0) {
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
        } else {
          console.log(
            `  [note] No @claude comment: workflow gates cleared by this run (not @claude).`,
          );
        }
      }
      if (readyForReviewLabelName && readyLabelAction !== "disabled" && readyLabelAction !== "unchanged") {
        if (readyLabelAction === "added") {
          console.log(
            `  [action] Added label \`${readyForReviewLabelName}\` (ready for review).`,
          );
        } else if (readyLabelAction === "removed") {
          console.log(
            `  [action] Removed label \`${readyForReviewLabelName}\` (no longer in ready state).`,
          );
        } else if (readyLabelAction === "dry_run_would_add" || readyLabelAction === "dry_run_would_remove") {
          console.log(
            `  [action] Dry-run: would ${readyLabelAction === "dry_run_would_add" ? "add" : "remove"} label \`${readyForReviewLabelName}\`.`,
          );
        } else if (readyLabelAction === "error") {
          console.log("  [action] ready-for-review label: update failed (see log above).");
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
            ready_for_review_label_added: summary.readyForReviewLabelAdded,
            ready_for_review_label_removed: summary.readyForReviewLabelRemoved,
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

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
