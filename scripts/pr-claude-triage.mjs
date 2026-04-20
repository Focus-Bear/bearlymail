#!/usr/bin/env node
/**
 * PR / issue triage for BearlyMail (ported from pr-claude-triage.sh).
 * Requires: gh (authenticated), git (for empty-commit CI trigger). No jq.
 *
 * PR log `check_runs` / `gh`’s statusCheckRollup: one entry per check run (Actions matrix jobs,
 * CodeQL languages, etc.), not per workflow — totals are larger than the merge UI summary.
 *
 * Optional PR labels `triaged/*` (see PR_TRIAGE_LABELS env): worst issue wins — conflicts, CI failure, or CI missing.
 *
 * Usage: node scripts/pr-claude-triage.mjs [options]
 * Env vars: same as the former bash script (see printHelp).
 */

import { execFileSync, execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TRIAGE_MARKER = "<!-- pr-claude-triage:automated -->";

/** Applied exclusively by {@link syncPrTriageLabels} (worst issue wins: conflicts → CI fail → CI missing). */
const TRIAGE_PR_LABELS = {
  conflicts: "triaged/conflicts-with-main",
  ciFailing: "triaged/ci-failing",
  ciMissing: "triaged/ci-missing-rollup",
};
const ALL_TRIAGED_PR_LABELS = Object.values(TRIAGE_PR_LABELS);

/** @typedef {ReturnType<typeof buildConfig>} Config */

function buildConfig(argv, env) {
  const repoRoot = path.resolve(__dirname, "..");
  const flags = parseArgv(argv);

  const repo = process.env.GITHUB_REPOSITORY || env.GITHUB_REPOSITORY || "Focus-Bear/BearlyMail";

  return {
    repo,
    repoOwner: repo.split("/")[0],
    repoRoot,
    bustIssueCache: flags.bustIssueCache,
    dryRun: flags.dryRun,
    doComment: flags.doComment,
    dedupeComments: flags.dedupeComments,
    triggerMissingCi: flags.triggerMissingCi,
    approvePendingWorkflows: env.APPROVE_PENDING_WORKFLOWS !== "0" && flags.approvePendingWorkflows,
    triageClaudeIssues: env.TRIAGE_CLAUDE_ISSUES !== "0" && flags.triageClaudeIssues,
    skipIfClaudeActionActive: env.SKIP_IF_CLAUDE_ACTION_ACTIVE !== "0" && flags.skipIfClaudeActionActive,
    sleepBetweenGh: flags.sleepBetweenGh,
    issueTriageCache: env.ISSUE_TRIAGE_CACHE !== "0" && flags.issueTriageCache,
    issueTriageCacheOpenTtlSec: numEnv(env.ISSUE_TRIAGE_CACHE_OPEN_TTL_SEC, 43200),
    issueTriageCacheDir: env.ISSUE_TRIAGE_CACHE_DIR || path.join(repoRoot, ".cache"),
    reviewReadySummary: env.REVIEW_READY_SUMMARY !== "0" && flags.reviewReadySummary,
    reviewReadyWorkflowName: env.REVIEW_READY_WORKFLOW_NAME || "CI",
    reviewReadyMinCiSuccess: numEnv(env.REVIEW_READY_MIN_CI_SUCCESS, 8),
    reviewReadyAllowPendingCi: env.REVIEW_READY_ALLOW_PENDING_CI !== "0",
    claudeTriageApproveSignatures: env.CLAUDE_TRIAGE_APPROVE_SIGNATURES || "claude,anthropic,co-authored-by",
    claudeBotLoginSubstring: env.CLAUDE_BOT_LOGIN_SUBSTRING || "claude",
    claudeIssueBranchPrefix: env.CLAUDE_ISSUE_BRANCH_PREFIX || "claude/issue-",
    defaultPrBase: env.DEFAULT_PR_BASE || "main",
    claudeIssueStuckMaxDays: numEnv(env.CLAUDE_ISSUE_STUCK_MAX_DAYS, 14),
    claudeIssueCommentScanPages: numEnv(env.CLAUDE_ISSUE_COMMENT_SCAN_PAGES, 10),
    githubActionsClaudeCommentMaxAgeSec: numEnv(env.GITHUB_ACTIONS_CLAUDE_COMMENT_MAX_AGE_SEC, 3240),
    reviewReadyExcludeUnaddressedGemini:
      env.REVIEW_READY_EXCLUDE_UNADDRESSED_GEMINI !== "0" && flags.reviewReadyExcludeUnaddressedGemini,
    geminiReviewBotSubstring: (env.GEMINI_REVIEW_BOT_SUBSTRING || "gemini").toLowerCase(),
    /** Ignore workflow runs whose updated_at/created_at are older than this (ms). 0 = no age limit. Default 2h. */
    claudeWorkflowActiveMaxAgeMs: parseClaudeWorkflowMaxAgeMs(env.CLAUDE_WORKFLOW_ACTIVE_MAX_AGE_MS),
    prTriageLabels: env.PR_TRIAGE_LABELS !== "0" && flags.prTriageLabels,
  };
}

function parseClaudeWorkflowMaxAgeMs(raw) {
  const n = parseInt(String(raw ?? ""), 10);
  if (Number.isFinite(n) && n >= 0) return n;
  return 2 * 60 * 60 * 1000;
}

function numEnv(v, d) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : d;
}

function parseArgv(argv) {
  const out = {
    dryRun: false,
    doComment: true,
    dedupeComments: true,
    triggerMissingCi: true,
    approvePendingWorkflows: true,
    triageClaudeIssues: true,
    skipIfClaudeActionActive: true,
    sleepBetweenGh: parseFloat(process.env.SLEEP_BETWEEN_GH || "0.25"),
    issueTriageCache: process.env.ISSUE_TRIAGE_CACHE !== "0",
    reviewReadySummary: process.env.REVIEW_READY_SUMMARY !== "0",
    reviewReadyExcludeUnaddressedGemini: process.env.REVIEW_READY_EXCLUDE_UNADDRESSED_GEMINI !== "0",
    prTriageLabels: process.env.PR_TRIAGE_LABELS !== "0",
    bustIssueCache: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      case "-R":
      case "--repo":
        process.env.GITHUB_REPOSITORY = next();
        break;
      case "-n":
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--no-comment":
        out.doComment = false;
        break;
      case "--force-comment":
        out.dedupeComments = false;
        break;
      case "--no-trigger-missing-ci":
        out.triggerMissingCi = false;
        break;
      case "--trigger-missing-ci":
        break;
      case "--no-approve-pending-workflows":
        out.approvePendingWorkflows = false;
        break;
      case "--no-triage-claude-issues":
        out.triageClaudeIssues = false;
        break;
      case "--no-skip-active-claude":
        out.skipIfClaudeActionActive = false;
        break;
      case "--no-review-ready-summary":
        out.reviewReadySummary = false;
        break;
      case "--no-review-ready-gemini-filter":
        out.reviewReadyExcludeUnaddressedGemini = false;
        break;
      case "--no-pr-triage-labels":
        out.prTriageLabels = false;
        break;
      case "--no-issue-triage-cache":
        out.issueTriageCache = false;
        break;
      case "--bust-issue-triage-cache":
        out.bustIssueCache = true;
        break;
      case "--sleep":
        out.sleepBetweenGh = parseFloat(next());
        break;
      default:
        console.error(`Unknown option: ${a}`);
        printHelp();
        process.exit(2);
    }
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/pr-claude-triage.mjs [options]

Same behavior and environment variables as the legacy shell script.
Also: REVIEW_READY_EXCLUDE_UNADDRESSED_GEMINI (default on), GEMINI_REVIEW_BOT_SUBSTRING (default: gemini).
      CLAUDE_WORKFLOW_ACTIVE_MAX_AGE_MS (default 7200000): ignore stale queued runs; 0 disables age filter.
      PR_TRIAGE_LABELS (default on): sync triaged/* PR labels; --no-pr-triage-labels to disable.

Options:
  -h, --help
  -R, --repo OWNER/REPO
  -n, --dry-run
  --no-comment
  --force-comment
  --no-trigger-missing-ci
  --trigger-missing-ci (no-op)
  --no-approve-pending-workflows
  --no-triage-claude-issues
  --no-skip-active-claude
  --no-review-ready-summary
  --no-review-ready-gemini-filter   Do not exclude PRs with unaddressed Gemini bot feedback (see env below)
  --no-pr-triage-labels             Do not add/update triaged/* labels on PRs
  --no-issue-triage-cache
  --bust-issue-triage-cache
  --sleep SECONDS
`);
}

function ghSleep(cfg) {
  const s = cfg.sleepBetweenGh;
  if (!(s > 0)) return;
  if (process.platform === "win32") {
    const until = Date.now() + s * 1000;
    while (Date.now() < until) {}
    return;
  }
  try {
    execSync(`sleep ${s}`, { stdio: "ignore" });
  } catch {
    const until = Date.now() + s * 1000;
    while (Date.now() < until) {}
  }
}

/** @param {string[]} args gh argv after 'gh' */
function ghExec(args, opts = {}) {
  try {
    const r = execFileSync("gh", args, {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    return typeof r === "string" ? r : String(r);
  } catch (e) {
    if (opts.optional) return null;
    throw e;
  }
}

function ghJson(args, opts = {}) {
  const out = ghExec(args, opts);
  if (out == null) return null;
  const t = out.trim();
  if (!t) return null;
  return JSON.parse(t);
}

function issueTriageCachePath(cfg) {
  const safe = cfg.repo.replace(/\//g, "-");
  return path.join(cfg.issueTriageCacheDir, `issue-triage-${safe}.json`);
}

function loadIssueCache(cfg) {
  const p = issueTriageCachePath(cfg);
  if (!fs.existsSync(p)) return { version: 1, issues: {} };
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { version: 1, issues: {} };
  }
}

function saveIssueCache(cfg, data) {
  const p = issueTriageCachePath(cfg);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 0), "utf8");
}

function issueTriageShouldSkip(cfg, issueNum) {
  if (!cfg.issueTriageCache) return false;
  const p = issueTriageCachePath(cfg);
  if (!fs.existsSync(p)) return false;
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return false;
  }
  const ent = doc.issues[String(issueNum)];
  if (!ent) return false;
  if (ent.state === "CLOSED") return true;
  if (ent.state === "OPEN") {
    const checked = Date.parse(ent.checkedAt);
    if (!Number.isFinite(checked)) return false;
    const ttlMs = cfg.issueTriageCacheOpenTtlSec * 1000;
    if (Date.now() - checked < ttlMs) return true;
  }
  return false;
}

function issueTriagePersist(cfg, issueNum, state) {
  if (!cfg.issueTriageCache || !state) return;
  const doc = loadIssueCache(cfg);
  doc.issues[String(issueNum)] = {
    state,
    checkedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
  saveIssueCache(cfg, doc);
}

function haystackMatchesClaudeSignatures(haystack, cfg) {
  if (!haystack) return false;
  const parts = cfg.claudeTriageApproveSignatures.split(",").map((s) => s.trim().toLowerCase());
  const h = haystack.toLowerCase();
  return parts.some((p) => p && h.includes(p));
}

function approveWaitingForkWorkflows(cfg) {
  if (!cfg.approvePendingWorkflows) return;
  console.log("Checking for pull_request workflow runs awaiting fork approval ...");
  let page = 1;
  while (true) {
    const resp = ghJson(
      [
        "api",
        `repos/${cfg.repo}/actions/runs?event=pull_request&status=waiting&per_page=100&page=${page}`,
      ],
      { optional: true },
    );
    ghSleep(cfg);
    if (!resp?.workflow_runs?.length) break;
    const batch = resp.workflow_runs;
    for (const run of batch) {
      const runId = run.id;
      const wfName = run.name || "workflow";
      if (!run.head_commit) {
        console.log(`  run #${runId} (${wfName}): skip (no head_commit on API — cannot match author)`);
        continue;
      }
      const msg = String(run.head_commit.message || "").slice(0, 8000);
      const author = run.head_commit.author?.name || "";
      const committer = run.head_commit.committer?.name || "";
      const trig = run.triggering_actor?.login || "";
      const hay = `${msg}\n${author}\n${committer}\n${trig}`;
      if (!haystackMatchesClaudeSignatures(hay, cfg)) {
        console.log(`  run #${runId} (${wfName}): skip (no CLAUDE_TRIAGE_APPROVE_SIGNATURES match)`);
        continue;
      }
      if (cfg.dryRun) {
        console.log(`  [dry-run] POST repos/${cfg.repo}/actions/runs/${runId}/approve (${wfName})`);
        continue;
      }
      const ok = ghExec(["api", "--method", "POST", `repos/${cfg.repo}/actions/runs/${runId}/approve`], {
        optional: true,
      });
      if (ok !== null) {
        console.log(`  Approved workflow run #${runId} (${wfName})`);
        ghSleep(cfg);
      } else {
        console.warn(
          `  [warn] approve failed for run #${runId} (${wfName}) — already approved, not a fork run, or token lacks permission`,
        );
      }
    }
    if (batch.length < 100) break;
    page += 1;
  }
  console.log("");
}

function commentBodyIndicatesPrOrCompareLink(body) {
  if (!body) return false;
  if (/github\.com\/[^\s)]+\/(pull\/[0-9]+|compare\/|pull\/new)/i.test(body)) return true;
  if (/create (a )?pull request/i.test(body)) return true;
  if (/\[[^\]]+\]\([^)]*(pull|compare)[^)]*\)/i.test(body)) return true;
  return false;
}

function collectCandidateClaudeIssues(cfg) {
  const maxDays = cfg.claudeIssueStuckMaxDays;
  const maxPages = cfg.claudeIssueCommentScanPages;
  const sub = cfg.claudeBotLoginSubstring.toLowerCase();
  const sinceIso = new Date(Date.now() - (maxDays + 1) * 86400000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const nums = new Set();
  for (let page = 1; page <= maxPages; page++) {
    let url = `repos/${cfg.repo}/issues/comments?per_page=100&page=${page}&sort=updated&direction=desc&since=${encodeURIComponent(sinceIso)}`;
    const arr = ghJson(["api", url], { optional: true });
    ghSleep(cfg);
    if (!Array.isArray(arr) || arr.length === 0) break;
    const cutoff = Date.now() - maxDays * 86400000;
    for (const c of arr) {
      const created = Date.parse(c.created_at);
      if (!Number.isFinite(created) || created <= cutoff) continue;
      const login = (c.user?.login || "").toLowerCase();
      if (!login.includes(sub)) continue;
      const issueUrl = c.issue_url || "";
      const last = issueUrl.split("/").pop();
      if (/^\d+$/.test(last)) nums.add(last);
    }
    if (arr.length < 100) break;
  }
  return [...nums].sort((a, b) => Number(a) - Number(b));
}

function encodeRefPrefix(p) {
  return encodeURIComponent(p).replace(/'/g, "%27");
}

function listRemoteBranchesForIssue(cfg, N) {
  const nameBase = `${cfg.claudeIssueBranchPrefix}${N}`;
  const refPrefix = `heads/${nameBase}`;
  const enc = encodeRefPrefix(refPrefix);
  const raw = ghExec(["api", `repos/${cfg.repo}/git/matching-refs/${enc}`, "--paginate"], { optional: true });
  ghSleep(cfg);
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const arr = Array.isArray(parsed) ? parsed : [];
  const branches = [];
  for (const ref of arr) {
    const r = ref.ref || "";
    const bn = r.replace(/^refs\/heads\//, "");
    if (bn === nameBase || bn.startsWith(`${nameBase}-`)) branches.push(bn);
  }
  return [...new Set(branches)].sort().reverse();
}

function resolveRemoteBranchForIssue(cfg, N) {
  const list = listRemoteBranchesForIssue(cfg, N);
  return list[0] || "";
}

function countPrsForHeadBranch(cfg, stateFilter, branch) {
  if (!branch) return 0;
  let n = ghJson(["pr", "list", "-R", cfg.repo, "--state", stateFilter, "--head", branch, "--json", "number"], {
    optional: true,
  });
  let len = Array.isArray(n) ? n.length : 0;
  if (len > 0) return len;
  n = ghJson(
    ["pr", "list", "-R", cfg.repo, "--state", stateFilter, "--head", `${cfg.repoOwner}:${branch}`, "--json", "number"],
    { optional: true },
  );
  return Array.isArray(n) ? n.length : 0;
}

/**
 * Posts or skips the @claude triage comment; always logs why.
 * @returns {'posted' | 'dry_run' | 'skipped' | 'failed'}
 */
function postClaudeComment(cfg, num, body, wfCache, headBranch = null) {
  const thread = `#${num}`;

  if (!cfg.doComment) {
    console.log(`  [no-action] Did not post on thread ${thread}: commenting disabled (--no-comment).`);
    return "skipped";
  }

  if (cfg.skipIfClaudeActionActive && cfg.dedupeComments) {
    if (repoHasActiveClaudeCodeWorkflowRun(cfg, wfCache, headBranch)) {
      const scope = headBranch ? `branch "${headBranch}"` : "repo-wide (recent)";
      console.log(
        `  [no-action] Did not post on thread ${thread}: ${scope} has a non-completed \`claude.yml\` workflow run (or matching stale/run within CLAUDE_WORKFLOW_ACTIVE_MAX_AGE_MS).`,
      );
      console.log(
        `  [no-action] Hint: override with --force-comment, or set SKIP_IF_CLAUDE_ACTION_ACTIVE=0 / --no-skip-active-claude.`,
      );
      return "skipped";
    }
    if (threadGithubActionsImpliesClaudeBusy(cfg, num)) {
      console.log(
        `  [no-action] Did not post on thread ${thread}: latest github-actions comment on this thread looks like an in-flight Claude notification (within GITHUB_ACTIONS_CLAUDE_COMMENT_MAX_AGE_SEC).`,
      );
      console.log(`  [no-action] Hint: override with --force-comment.`);
      return "skipped";
    }
  } else if (!cfg.dedupeComments) {
    console.log(
      `  [decision] Active-workflow / github-actions-busy guards skipped (--force-comment): still posting comment on ${thread}.`,
    );
  }

  if (cfg.dedupeComments) {
    const last = ghExec(
      [
        "api",
        `repos/${cfg.repo}/issues/${num}/comments`,
        "--paginate",
        "--jq",
        "sort_by(.created_at) | .[-1].body // \"\"",
      ],
      { optional: true },
    );
    ghSleep(cfg);
    if (last && last.includes(TRIAGE_MARKER)) {
      console.log(
        `  [no-action] Did not post on thread ${thread}: latest *issue comment* already contains the triage footer (duplicate ping guard).`,
      );
      console.log(
        `  [no-action] Note: only issue comments are checked — review threads / reviews are not scanned. Hint: --force-comment to bypass.`,
      );
      return "skipped";
    }
  }

  const full = `${body}\n\n${TRIAGE_MARKER}`;
  if (cfg.dryRun) {
    console.log(`  [action] Dry-run only: would post @claude comment on thread ${thread} (no GitHub write).`);
    return "dry_run";
  }

  try {
    execFileSync("gh", ["issue", "comment", String(num), "-R", cfg.repo, "--body", full], {
      encoding: "utf8",
      stdio: "inherit",
    });
    console.log(`  [action] Posted @claude triage comment on thread ${thread}.`);
    ghSleep(cfg);
    return "posted";
  } catch {
    console.warn(`  [warn] gh issue comment failed for ${thread} (continuing with other PRs)`);
    console.log(`  [no-action] Comment not created on ${thread}: gh exited with an error (see stderr above).`);
    return "failed";
  }
}

function processOneClaudeIssueNumber(cfg, N, wfCache) {
  const maxDays = cfg.claudeIssueStuckMaxDays;
  const prBase = cfg.defaultPrBase;
  const sub = cfg.claudeBotLoginSubstring.toLowerCase();

  if (cfg.issueTriageCache && issueTriageShouldSkip(cfg, N)) {
    console.log(`  Issue #${N}: skip (issue triage cache)`);
    return;
  }

  let state = ghExec(["issue", "view", String(N), "-R", cfg.repo, "--json", "state", "-q", ".state"], {
    optional: true,
  });
  state = (state || "").trim();
  ghSleep(cfg);
  if (state) issueTriagePersist(cfg, N, state);

  if (state !== "OPEN") {
    console.log(`  Issue #${N}: skip (state=${state || "unknown"})`);
    return;
  }

  const nameBase = `${cfg.claudeIssueBranchPrefix}${N}`;
  const branch = resolveRemoteBranchForIssue(cfg, N);

  console.log("");
  console.log(`Issue #${N}: branch prefix ${nameBase} (resolved: ${branch || "none"})`);

  if (branch) {
    console.log(`  Remote branch exists (${branch}).`);
    ghSleep(cfg);
    const openN = countPrsForHeadBranch(cfg, "open", branch);
    const mergedN = countPrsForHeadBranch(cfg, "merged", branch);

    if (openN > 0) {
      let prUrl =
        ghExec(["pr", "list", "-R", cfg.repo, "--state", "open", "--head", branch, "--json", "url", "-q", ".[0].url"], {
          optional: true,
        }) || "";
      prUrl = prUrl.trim();
      if (!prUrl || prUrl === "null") {
        prUrl =
          ghExec(
            ["pr", "list", "-R", cfg.repo, "--state", "open", "--head", `${cfg.repoOwner}:${branch}`, "--json", "url", "-q", ".[0].url"],
            { optional: true },
          )?.trim() || "";
      }
      console.log(`  Open PR already exists for head ${branch}${prUrl ? ` → ${prUrl}` : ""}`);
      return;
    }
    if (mergedN > 0) {
      console.log("  A merged PR already used this branch naming pattern; skip auto-create.");
      return;
    }

    let title =
      ghExec(["issue", "view", String(N), "-R", cfg.repo, "--json", "title", "-q", ".title"], { optional: true })?.trim() ||
      `Issue #${N}`;

    if (cfg.dryRun) {
      console.log(`  [dry-run] gh pr create --draft --base ${prBase} --head ${branch} --title "${title}" ...`);
      return;
    }
    try {
      execFileSync(
        "gh",
        ["pr", "create", "-R", cfg.repo, "--draft", "--base", prBase, "--head", branch, "--title", title, "--body", `References #${N}`],
        { stdio: "inherit" },
      );
      console.log(`  Created PR from ${branch} → ${prBase}.`);
      ghSleep(cfg);
    } catch {
      console.warn(`  [warn] gh pr create failed (try gh pr create --head ${cfg.repoOwner}:${branch} manually)`);
    }
    return;
  }

  console.log(`  No remote branch matching ${nameBase} or ${nameBase}-<suffix>.`);

  const commentsJson = ghJson(["api", `repos/${cfg.repo}/issues/${N}/comments?per_page=100`, "--paginate"], {
    optional: true,
  });
  ghSleep(cfg);
  if (!Array.isArray(commentsJson)) {
    console.warn(`  [warn] could not load issue comments for #${N}`);
    return;
  }

  const cutoff = Date.now() - maxDays * 86400000;
  const recent = commentsJson.filter((c) => {
    const t = Date.parse(c.created_at);
    return Number.isFinite(t) && t > cutoff && (c.user?.login || "").toLowerCase().includes(sub);
  });
  recent.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const latestCb = recent[recent.length - 1];
  if (!latestCb) {
    console.log(`  No Claude comment in the last ${maxDays} days; skip stuck ping.`);
    return;
  }

  const latestBody = latestCb.body || "";
  if (commentBodyIndicatesPrOrCompareLink(latestBody)) {
    console.log("  Latest Claude comment already has PR/compare cues; skip stuck ping.");
    return;
  }

  const bodyText = `@claude You commented on this issue recently but there is no branch named \`${nameBase}\` or \`${nameBase}-...\` on the repo and no PR/compare link in that update. Please push your work to that branch naming pattern (see workflow instructions) and open a draft PR that **References #${N}** (do not use "Closes"). Thanks!`;

  console.log(`  [decision] Issue #${N}: ping @claude (no matching remote branch / PR link in recent Claude comment).`);
  postClaudeComment(cfg, N, bodyText, wfCache, branch || null);
}

function triageClaudeIssuesAndBranches(cfg, wfCache) {
  if (!cfg.triageClaudeIssues) return;
  console.log("Triage Claude issue branches / stuck issue comments ...");
  const candidates = collectCandidateClaudeIssues(cfg);
  if (candidates.length === 0) {
    console.log("  No recent Claude issue comments in scan window.");
    console.log("");
    return;
  }
  for (const n of candidates) {
    processOneClaudeIssueNumber(cfg, n, wfCache);
  }
  console.log("");
}

/**
 * Workflow runs that have finished (success/failure/skipped/etc.). Always ignore these for “active Claude” checks.
 * API list filters use status=queued|… but we enforce this client-side too.
 */
function workflowRunStatusIsCompleted(run) {
  return String(run.status ?? "").toUpperCase() === "COMPLETED";
}

/**
 * True if claude.yml has a non-terminal run we should treat as blocking @claude pings.
 * Scoped to **headBranch** when set (PR comments) so another PR’s workflow never blocks this one.
 * Drops stale runs via {@link Config#claudeWorkflowActiveMaxAgeMs}.
 */
function workflowRunLooksRecentlyActive(run, maxAgeMs) {
  if (maxAgeMs <= 0) return true;
  const u = Date.parse(run.updated_at || "");
  const c = Date.parse(run.created_at || "");
  const latest = Math.max(Number.isFinite(u) ? u : 0, Number.isFinite(c) ? c : 0);
  if (!latest) return false;
  return Date.now() - latest <= maxAgeMs;
}

function claudeYamlRunCountsAsBlocking(run, cfg, headBranch) {
  if (!run || !/claude\.yml/i.test(run.path || "")) return false;
  if (workflowRunStatusIsCompleted(run)) return false;
  if (!workflowRunLooksRecentlyActive(run, cfg.claudeWorkflowActiveMaxAgeMs)) return false;
  if (headBranch) {
    return (run.head_branch || "") === headBranch;
  }
  return true;
}

function repoHasActiveClaudeCodeWorkflowRun(cfg, wfCacheRef, headBranch) {
  const cacheKey = headBranch ?? "__issue_or_repo__";
  wfCacheRef.branchBusy = wfCacheRef.branchBusy ?? {};
  if (Object.prototype.hasOwnProperty.call(wfCacheRef.branchBusy, cacheKey)) {
    return wfCacheRef.branchBusy[cacheKey];
  }

  const statuses = ["queued", "in_progress", "pending", "waiting"];
  let wfId = ghExec(["api", `repos/${cfg.repo}/actions/workflows/claude.yml`, "--jq", ".id"], { optional: true })?.trim();
  ghSleep(cfg);

  const queryRuns = (urlPath) => {
    const resp = ghJson(["api", urlPath], { optional: true });
    ghSleep(cfg);
    const runs = resp?.workflow_runs || [];
    return runs.some((r) => claudeYamlRunCountsAsBlocking(r, cfg, headBranch));
  };

  if (wfId && wfId !== "null") {
    for (const st of statuses) {
      let path = `repos/${cfg.repo}/actions/workflows/${wfId}/runs?status=${encodeURIComponent(st)}&per_page=50`;
      if (headBranch) {
        path += `&branch=${encodeURIComponent(headBranch)}`;
      }
      if (queryRuns(path)) {
        wfCacheRef.branchBusy[cacheKey] = true;
        return true;
      }
    }
    wfCacheRef.branchBusy[cacheKey] = false;
    return false;
  }

  for (const st of statuses) {
    let path = `repos/${cfg.repo}/actions/runs?status=${encodeURIComponent(st)}&per_page=100`;
    const resp = ghJson(["api", path], { optional: true });
    ghSleep(cfg);
    const runs = resp?.workflow_runs || [];
    const hit = runs.some((r) => claudeYamlRunCountsAsBlocking(r, cfg, headBranch));
    if (hit) {
      wfCacheRef.branchBusy[cacheKey] = true;
      return true;
    }
  }
  wfCacheRef.branchBusy[cacheKey] = false;
  return false;
}

function loginMatchesGeminiBot(login, cfg) {
  const sub = cfg.geminiReviewBotSubstring;
  if (!sub) return false;
  return (login || "").toLowerCase().includes(sub);
}

/**
 * Latest activity time (ms) from PR reviews, inline review comments, and issue comments
 * where the author login matches {@link Config#geminiReviewBotSubstring} (default: "gemini" for e.g. gemini-code-assist[bot]).
 */
function latestGeminiFeedbackMs(cfg, prNumber) {
  let maxMs = 0;

  const reviews = ghJson(["api", `repos/${cfg.repo}/pulls/${prNumber}/reviews`, "--paginate"], { optional: true });
  ghSleep(cfg);
  if (Array.isArray(reviews)) {
    for (const r of reviews) {
      if (!loginMatchesGeminiBot(r.user?.login, cfg)) continue;
      const t = Date.parse(r.submitted_at || "");
      if (Number.isFinite(t) && t > maxMs) maxMs = t;
    }
  }

  const lineComments = ghJson(["api", `repos/${cfg.repo}/pulls/${prNumber}/comments`, "--paginate"], { optional: true });
  ghSleep(cfg);
  if (Array.isArray(lineComments)) {
    for (const c of lineComments) {
      if (!loginMatchesGeminiBot(c.user?.login, cfg)) continue;
      const created = Date.parse(c.created_at || "");
      const updated = Date.parse(c.updated_at || c.created_at || "");
      const t = Math.max(Number.isFinite(created) ? created : 0, Number.isFinite(updated) ? updated : 0);
      if (t > maxMs) maxMs = t;
    }
  }

  const issueComments = ghJson(["api", `repos/${cfg.repo}/issues/${prNumber}/comments`, "--paginate"], { optional: true });
  ghSleep(cfg);
  if (Array.isArray(issueComments)) {
    for (const c of issueComments) {
      if (!loginMatchesGeminiBot(c.user?.login, cfg)) continue;
      const created = Date.parse(c.created_at || "");
      const updated = Date.parse(c.updated_at || c.created_at || "");
      const t = Math.max(Number.isFinite(created) ? created : 0, Number.isFinite(updated) ? updated : 0);
      if (t > maxMs) maxMs = t;
    }
  }

  return maxMs > 0 ? maxMs : null;
}

/** Timestamp (ms) of the PR head commit (author/committer max), via head SHA. */
function prTipCommitTimestampMs(cfg, prNumber) {
  const pr = ghJson(["api", `repos/${cfg.repo}/pulls/${prNumber}`], { optional: true });
  ghSleep(cfg);
  const sha = pr?.head?.sha;
  if (!sha) return null;
  const detail = ghJson(["api", `repos/${cfg.repo}/commits/${sha}`], { optional: true });
  ghSleep(cfg);
  const auth = Date.parse(detail?.commit?.author?.date || "");
  const com = Date.parse(detail?.commit?.committer?.date || "");
  const ms = Math.max(Number.isFinite(auth) ? auth : 0, Number.isFinite(com) ? com : 0);
  return ms > 0 ? ms : null;
}

/**
 * GitHub `statusCheckRollup` is one row per **check run** (every matrix leg, CodeQL language,
 * job, etc.), not one per workflow — the count is usually much larger than the merge box summary.
 */
function summarizeStatusCheckRollup(checks) {
  const list = Array.isArray(checks) ? checks : [];
  let ok = 0;
  let fail = 0;
  let timedOut = 0;
  let skipped = 0;
  let cancelled = 0;
  let neutral = 0;
  let notCompleted = 0;

  for (const c of list) {
    const st = String(c.status ?? "").toUpperCase();
    const con = String(c.conclusion ?? "").toUpperCase();

    if (st !== "COMPLETED") {
      notCompleted++;
      continue;
    }
    if (con === "SUCCESS") ok++;
    else if (con === "FAILURE") fail++;
    else if (con === "TIMED_OUT") timedOut++;
    else if (con === "SKIPPED") skipped++;
    else if (con === "CANCELLED") cancelled++;
    else if (con === "NEUTRAL") neutral++;
    else if (con === "ACTION_REQUIRED") notCompleted++;
    else fail++;
  }

  const failTotal = fail + timedOut;
  return { total: list.length, ok, fail, timedOut, failTotal, skipped, cancelled, neutral, notCompleted };
}

function formatCheckRollupLog(s) {
  return (
    `check_runs=${s.total} completed_ok=${s.ok} completed_fail=${s.failTotal}` +
    ` skipped=${s.skipped} cancelled=${s.cancelled} queued_or_running=${s.notCompleted}`
  );
}

function computePrTriageLabel(conflict, failCount, ciMissing) {
  if (conflict) return TRIAGE_PR_LABELS.conflicts;
  if (failCount > 0) return TRIAGE_PR_LABELS.ciFailing;
  if (ciMissing) return TRIAGE_PR_LABELS.ciMissing;
  return null;
}

function ensurePrTriageLabelsExist(cfg) {
  const defs = [
    [TRIAGE_PR_LABELS.conflicts, "b60205", "Merge conflicts with main (pr-claude-triage)"],
    [TRIAGE_PR_LABELS.ciFailing, "d8760d", "CI failure on latest run (pr-claude-triage)"],
    [TRIAGE_PR_LABELS.ciMissing, "f9d0c4", "No CI workflow in status rollup (pr-claude-triage)"],
  ];
  for (const [name, color, desc] of defs) {
    try {
      execFileSync("gh", ["label", "create", name, "-R", cfg.repo, "--color", color, "--description", desc], {
        stdio: "pipe",
      });
    } catch {
      /* label already exists */
    }
    ghSleep(cfg);
  }
}

function syncPrTriageLabels(cfg, prNumber, targetLabel) {
  if (!cfg.prTriageLabels) return;

  if (cfg.dryRun) {
    console.log(
      `  [action] Dry-run: would sync triage labels on PR #${prNumber} → ${targetLabel ?? "(clear all triaged/*)"}`,
    );
    return;
  }

  for (const lab of ALL_TRIAGED_PR_LABELS) {
    try {
      execFileSync("gh", ["pr", "edit", String(prNumber), "-R", cfg.repo, "--remove-label", lab], {
        stdio: "pipe",
      });
    } catch {
      /* not applied */
    }
    ghSleep(cfg);
  }

  if (targetLabel) {
    try {
      execFileSync("gh", ["pr", "edit", String(prNumber), "-R", cfg.repo, "--add-label", targetLabel], {
        stdio: "pipe",
      });
      console.log(`  [action] PR #${prNumber} label set to ${targetLabel}`);
    } catch (e) {
      console.warn(`  [warn] Could not add label "${targetLabel}" on PR #${prNumber}`);
    }
    ghSleep(cfg);
  } else {
    console.log(`  [action] PR #${prNumber}: removed triaged/* labels (no blocking triage issue)`);
  }
}

function checkRunIsCompletedFailure(c) {
  const st = String(c.status ?? "").toUpperCase();
  const con = String(c.conclusion ?? "").toUpperCase();
  return st === "COMPLETED" && (con === "FAILURE" || con === "TIMED_OUT");
}

function threadGithubActionsImpliesClaudeBusy(cfg, num) {
  const maxSec = cfg.githubActionsClaudeCommentMaxAgeSec;
  const raw = ghExec(["api", `repos/${cfg.repo}/issues/${num}/comments?per_page=100`, "--paginate"], { optional: true });
  ghSleep(cfg);
  if (!raw) return false;
  let comments;
  try {
    comments = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!Array.isArray(comments)) return false;
  const ga = comments.filter((c) => (c.user?.login || "").toLowerCase().includes("github-actions"));
  ga.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const last = ga[ga.length - 1];
  if (!last?.body || !last.created_at) return false;
  const ageMs = Date.now() - Date.parse(last.created_at);
  if (!Number.isFinite(ageMs) || ageMs > maxSec * 1000) return false;
  const body = last.body;
  if (!/claude/i.test(body)) return false;
  if (/claude finished/i.test(body)) return false;
  if (/task failed|could not complete|unable to complete|has been canceled|has been cancelled/i.test(body)) return false;
  if (/(^|\s)failed(\s|$)/i.test(body)) return false;
  return true;
}

function appendReviewReadyLine(cfg, row, lines) {
  if (!cfg.reviewReadySummary) return;
  const wf = cfg.reviewReadyWorkflowName;
  const rollup = row.statusCheckRollup || [];
  const ci = rollup.filter((c) => c.workflowName === wf);
  const ns = ci.filter((c) => {
    const st = String(c.status ?? "").toUpperCase();
    const con = String(c.conclusion ?? "").toUpperCase();
    return st === "COMPLETED" && con === "SUCCESS";
  }).length;
  const nf = ci.filter((c) => {
    const st = String(c.status ?? "").toUpperCase();
    const con = String(c.conclusion ?? "").toUpperCase();
    return st === "COMPLETED" && (con === "FAILURE" || con === "TIMED_OUT");
  }).length;
  const np = ci.filter((c) => String(c.status ?? "").toUpperCase() !== "COMPLETED").length;
  const okMerge = row.mergeable === "MERGEABLE";
  const pendingOk = cfg.reviewReadyAllowPendingCi ? true : np === 0;
  if (!okMerge || ns < cfg.reviewReadyMinCiSuccess || nf !== 0 || !pendingOk) return;

  if (cfg.reviewReadyExcludeUnaddressedGemini) {
    const geminiMs = latestGeminiFeedbackMs(cfg, row.number);
    if (geminiMs != null) {
      const tipMs = prTipCommitTimestampMs(cfg, row.number);
      if (tipMs == null || tipMs <= geminiMs) {
        console.log(
          `  [review-ready skip] PR #${row.number}: Gemini/Code Assist feedback after the latest push (need a commit after bot comments).`,
        );
        return;
      }
    }
  }

  lines.push(`${row.number}\t${row.title}\t${row.url}\t${ns}\t${nf}\t${np}`);
}

function printReviewReadySummary(cfg, lines) {
  if (!cfg.reviewReadySummary) return;
  const wf = cfg.reviewReadyWorkflowName;
  const min = cfg.reviewReadyMinCiSuccess;
  console.log("");
  const geminiNote = cfg.reviewReadyExcludeUnaddressedGemini
    ? "; excludes PRs where Gemini matched-bot commented after the latest commit"
    : "";
  console.log(
    `========== Ready for your review (mergeable + workflow "${wf}": ≥${min} successful, 0 failed; cancelled/skipped ignored${geminiNote}) ==========`,
  );
  if (lines.length === 0) {
    console.log("(none)");
    return;
  }
  for (const line of lines) {
    const [prnum, title, url, ns, nf, np] = line.split("\t");
    console.log(`  PR #${prnum}: ${title}`);
    console.log(`    ${url}`);
    console.log(`    ${wf} checks: ${ns} successful, ${nf} failed, ${np} not completed (in progress / queued)`);
  }
}

function gitStatusPorcelain(cwd) {
  return execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).trim();
}

/**
 * Fast-forward to origin/{branch}. Avoids `git pull`, which often uses rebase and refuses to run with a dirty tree.
 * If the working tree has local edits, stash them temporarily, merge, then the caller pops the stash in `finally`.
 */
function mergeFfOnlyFromOrigin(cwd, branch) {
  execFileSync("git", ["merge", "--ff-only", `origin/${branch}`], { cwd, stdio: "inherit" });
}

function pushEmptyCi(cfg, branch) {
  if (!cfg.triggerMissingCi) return;
  if (cfg.dryRun) {
    console.log(`  [dry-run] git checkout ${branch} && empty commit && push`);
    return;
  }
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
  } catch {
    console.error("git is required to push empty commits when CI is missing (or use --no-trigger-missing-ci)");
    process.exit(1);
  }
  const cwd = cfg.repoRoot;
  const runGit = (args) => {
    execFileSync("git", args, { cwd, stdio: "inherit" });
  };

  let stashed = false;
  try {
    runGit(["fetch", "origin"]);
    const hasLocal = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd }).status === 0;
    if (hasLocal) {
      runGit(["checkout", branch]);
    } else {
      const hasRemote =
        spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`], { cwd }).status === 0;
      if (hasRemote) {
        runGit(["checkout", "-B", branch, `origin/${branch}`]);
      } else {
        console.error(`  [error] branch not found locally or on origin: ${branch}`);
        throw new Error("branch-not-found");
      }
    }

    try {
      mergeFfOnlyFromOrigin(cwd, branch);
    } catch (mergeErr) {
      if (!gitStatusPorcelain(cwd)) {
        throw mergeErr;
      }
      console.log(
        "  [info] Stashing local changes so the branch can sync with origin (they will be restored after push).",
      );
      runGit(["stash", "push", "-m", "pr-claude-triage: temporary stash before empty CI commit"]);
      stashed = true;
      mergeFfOnlyFromOrigin(cwd, branch);
    }

    runGit(["commit", "--allow-empty", "-m", "chore: trigger CI"]);
    runGit(["push", "origin", branch]);
  } finally {
    if (stashed) {
      try {
        console.log("  [info] Restoring stashed local changes ...");
        execFileSync("git", ["stash", "pop"], { cwd, stdio: "inherit" });
      } catch {
        console.warn("  [warn] git stash pop failed. Recover with: git stash list && git stash pop");
      }
    }
  }
}

function main() {
  const argv = process.argv.slice(2);
  const env = process.env;

  const cfg = buildConfig(argv, env);

  try {
    execFileSync("gh", ["auth", "status"], { stdio: "ignore" });
  } catch {
    console.error("gh is required and must be authenticated");
    process.exit(1);
  }

  if (cfg.bustIssueCache) {
    const p = issueTriageCachePath(cfg);
    try {
      fs.unlinkSync(p);
    } catch {
      /* noop */
    }
    console.log(`Removed issue triage cache: ${p}`);
    process.exit(0);
  }

  const wfCache = { branchBusy: {} };

  approveWaitingForkWorkflows(cfg);
  triageClaudeIssuesAndBranches(cfg, wfCache);

  console.log(`Fetching open PRs from ${cfg.repo} ...`);
  const prs = ghJson([
    "pr",
    "list",
    "-R",
    cfg.repo,
    "--state",
    "open",
    "--limit",
    "200",
    "--json",
    "number,title,headRefName,url,mergeable,mergeStateStatus,statusCheckRollup",
  ]);
  ghSleep(cfg);

  if (!Array.isArray(prs)) {
    console.error("Failed to list pull requests");
    process.exit(1);
  }

  const reviewLines = [];

  if (cfg.prTriageLabels && !cfg.dryRun) {
    ensurePrTriageLabelsExist(cfg);
  }

  for (const row of prs) {
    const checks = row.statusCheckRollup || [];
    const rollupStats = summarizeStatusCheckRollup(checks);
    const rollupLen = rollupStats.total;
    const hasCi = checks.some((c) => c.workflowName === "CI");
    const conflict = row.mergeable === "CONFLICTING" || row.mergeStateStatus === "DIRTY";
    const failed = checks.filter((c) => checkRunIsCompletedFailure(c));
    const failCount = failed.length;
    const ciMissing = rollupLen === 0 || !hasCi;
    const targetLabel = computePrTriageLabel(conflict, failCount, ciMissing);

    console.log("");
    console.log(`PR #${row.number}: ${row.title}`);
    console.log(`  branch=${row.headRefName}  url=${row.url}`);
    console.log(
      `  mergeable=${row.mergeable ?? "UNKNOWN"} mergeStateStatus=${row.mergeStateStatus ?? "UNKNOWN"}  ${formatCheckRollupLog(rollupStats)}  has_ci=${hasCi}  failures=${failCount}  conflict=${conflict ? 1 : 0}  ci_missing=${ciMissing ? 1 : 0}`,
    );

    syncPrTriageLabels(cfg, row.number, targetLabel);

    const parts = [];
    if (conflict) {
      parts.push(
        `This branch has **merge conflicts with \`main\`** (mergeable: ${row.mergeable}, state: ${row.mergeStateStatus}). Please merge or rebase \`main\`, resolve conflicts, and push.`,
      );
    }
    if (failCount > 0) {
      const names = failed.map((f) => f.name || f.context || "(unnamed)").join(", ");
      parts.push(
        `CI has **failing checks** on the latest completed run: ${names}. Please fix failures or merge/rebase \`main\` as needed, then push.`,
      );
    }

    if (parts.length > 0) {
      const intent = [];
      if (conflict) intent.push("merge conflicts");
      if (failCount > 0) intent.push("CI failures");
      console.log(`  [decision] Triage asks @claude to fix: ${intent.join("; ")}.`);
      let body = `@claude Please address this PR:\n`;
      for (const p of parts) body += `- ${p}\n`;
      body += `\nThanks!`;
      if (cfg.prTriageLabels && targetLabel) {
        body += `\n\n**Labels:** This PR should show GitHub label \`${targetLabel}\` (the triage script keeps \`triaged/*\` in sync). When you have finished fixing the issues above, **update labels**: remove any \`triaged/conflicts-with-main\`, \`triaged/ci-failing\`, or \`triaged/ci-missing-rollup\` that no longer apply so the PR reflects current state.\n`;
      }
      postClaudeComment(cfg, row.number, body, wfCache, row.headRefName);
    } else if (ciMissing) {
      console.log(
        `  [decision] No @claude ping for PR #${row.number}: status rollup has no workflow named "CI" (has_ci=false, ci_missing=1).`,
      );
      console.log("  [info] No CI rollup / no CI workflow name \"CI\" in API response.");
      if (cfg.triggerMissingCi) {
        console.log("  [action] Attempting empty commit on head branch to trigger CI …");
        try {
          pushEmptyCi(cfg, row.headRefName);
          console.log(`  [action] Empty commit path finished for branch ${row.headRefName}.`);
        } catch {
          console.warn(`  [warn] push_empty_ci failed for ${row.headRefName}`);
          console.log(`  [no-action] Empty commit was not pushed; CI may still be missing from the API until the next sync.`);
        }
      } else {
        console.log("  [no-action] Empty commit not attempted (--no-trigger-missing-ci).");
      }
    } else {
      console.log(
        `  [decision] No triage ping for PR #${row.number}: CI rollup looks healthy (no completed failures), merge conflict flag clear.`,
      );
    }

    appendReviewReadyLine(cfg, row, reviewLines);
  }

  printReviewReadySummary(cfg, reviewLines);
  console.log("");
  console.log("Done.");
}

main();
