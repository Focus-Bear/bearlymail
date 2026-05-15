/**
 * Local `claude -p` resolver for CI failures.
 *
 * Triggered when a PR has at least one failed check run on its head SHA. Sets up
 * an isolated git worktree at `.claude/worktrees/ci-pr-{N}` from `origin/{headRef}`,
 * fetches the failed-job logs from GitHub Actions, and runs `claude -p` with a
 * prompt that asks Claude to fix the root cause and push.
 *
 * Returns `{ ok: false, action: ... }` if prerequisites are missing (no clone,
 * origin mismatch, no claude CLI, lock contention) or the invocation fails.
 */

import { execFileSync } from "node:child_process";

import { LOCAL_CLAUDE_TIMEOUT_MS } from "./constants.mjs";
import {
  isInsideGitWorkTree,
  originRemoteMatchesRepository,
  gitInRepo,
} from "./git-local.mjs";
import { fetchCheckRunsForSha } from "./github.mjs";
import {
  RESOLVER_KIND_CI,
  hasClaudeCli,
  spawnResolverChild,
  tryAcquireResolverLock,
} from "./resolver-lock.mjs";

/** Tools allowed when `claude -p` runs to fix CI failures. Wider than the conflict resolver:
 * needs `npm`, `npx`, and test commands so it can verify locally before pushing. */
const CI_RESOLVER_ALLOWED_TOOLS = [
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
  "Bash(npm:*)",
  "Bash(npx:*)",
  "Bash(node:*)",
];

const MAX_LOG_BYTES_PER_RUN = 12_000;

/**
 * Failed check runs that come from GitHub Actions carry a `details_url` like
 * `https://github.com/owner/repo/actions/runs/<run_id>/job/<job_id>`. Returns the
 * unique workflow run IDs so we can fetch their failed-job logs.
 *
 * Non-Actions checks (CodeQL, third-party CIs) have different `details_url`
 * formats — we still report them by name in the prompt, just without logs.
 *
 * @param {Array<Record<string, unknown>>} checkRuns
 */
export function partitionFailedRuns(checkRuns) {
  const failed = checkRuns.filter((c) => {
    const conc = c?.conclusion;
    return conc === "failure" || conc === "timed_out" || conc === "action_required";
  });
  /** @type {Map<string, { run_id: string, names: string[] }>} */
  const byRunId = new Map();
  /** @type {Array<{ name: string, conclusion: string, summary: string }>} */
  const noActionsRun = [];
  for (const c of failed) {
    const detailsUrl = String(c?.details_url ?? "");
    const m = detailsUrl.match(/\/actions\/runs\/(\d+)\//);
    if (m) {
      const runId = m[1];
      const entry = byRunId.get(runId) ?? { run_id: runId, names: [] };
      entry.names.push(String(c.name ?? "(unnamed)"));
      byRunId.set(runId, entry);
    } else {
      noActionsRun.push({
        name: String(c.name ?? "(unnamed)"),
        conclusion: String(c.conclusion ?? "?"),
        summary: String(c?.output?.summary ?? c?.output?.title ?? ""),
      });
    }
  }
  return { byRunId: [...byRunId.values()], noActionsRun };
}

/**
 * Calls `gh run view <run_id> --log-failed --repo <owner>/<repo>` and returns the
 * head + tail of the output (so even very long logs fit a tractable token budget).
 *
 * @returns {string}
 */
function fetchFailedRunLog(owner, repo, runId) {
  let raw = "";
  try {
    raw = execFileSync(
      "gh",
      ["run", "view", String(runId), "--log-failed", "--repo", `${owner}/${repo}`],
      { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
    );
  } catch (e) {
    return `[ERROR fetching logs for run ${runId}: ${(e && e.message) || e}]`;
  }
  if (raw.length <= MAX_LOG_BYTES_PER_RUN) return raw.trimEnd();
  const headSize = Math.floor(MAX_LOG_BYTES_PER_RUN * 0.3);
  const tailSize = MAX_LOG_BYTES_PER_RUN - headSize;
  return `${raw.slice(0, headSize)}\n\n[... truncated ${
    raw.length - headSize - tailSize
  } bytes; tail follows ...]\n\n${raw.slice(raw.length - tailSize)}`.trimEnd();
}

export function buildCiFailurePrompt({
  prMerge,
  headRef,
  baseRef,
  byRunId,
  noActionsRun,
  logsByRunId,
}) {
  const lines = [
    `You are fixing CI failures on pull request #${prMerge.number}: ${prMerge.title ?? "(no title)"}.`,
    "",
    "Context:",
    "- This isolated git worktree was created by scripts/pr-claude-triage.mjs.",
    `- The branch checked out is \`${headRef}\` at the same SHA as the PR head.`,
    `- The base branch is \`${baseRef}\`. There are no merge conflicts; the only problem is that one or more checks failed.`,
    "",
    "Failed checks:",
  ];
  for (const entry of byRunId) {
    lines.push(`- workflow run ${entry.run_id}: ${entry.names.join(", ")}`);
  }
  for (const entry of noActionsRun) {
    const summary = entry.summary ? ` — ${entry.summary.slice(0, 200)}` : "";
    lines.push(`- ${entry.name} (${entry.conclusion}, no Actions logs available)${summary}`);
  }
  lines.push("");
  lines.push("Failure logs (head + tail per workflow run):");
  for (const entry of byRunId) {
    lines.push("");
    lines.push(`### workflow run ${entry.run_id} — ${entry.names.join(", ")}`);
    lines.push("```");
    lines.push(logsByRunId[entry.run_id] ?? "[no log captured]");
    lines.push("```");
  }
  lines.push("");
  lines.push("Tasks:");
  lines.push("1. Read the failure logs and identify the root cause(s).");
  lines.push(
    "2. Fix the root cause in code. Do NOT disable tests, comment out assertions, or skip checks just to make CI pass — fix the underlying bug.",
  );
  lines.push(
    "3. Where it's fast, run the relevant test/lint command locally inside this worktree to confirm the fix.",
  );
  lines.push('4. Stage and commit with: `git commit -m "fix(ci): <short summary of the fix>"`.');
  lines.push(`5. Push the fix to the PR branch: \`git push origin HEAD:${headRef}\`.`);
  lines.push("");
  lines.push(
    "If the failure is genuinely caused by infrastructure (flaky external service, transient network, etc.) and there is no code-level fix, do NOT commit. Exit with a one-paragraph explanation and a human will retrigger or investigate.",
  );
  return lines.join("\n");
}

/**
 * @param {Array<Record<string, unknown>>} checkRuns - array from fetchCheckRunsForSha
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   action: string,
 *   detail?: string,
 *   worktree?: string,
 * }>}
 */
export async function maybeResolveCiFailuresWithLocalClaude(
  owner,
  repo,
  prMerge,
  gitCwd,
  checkRuns,
  options,
) {
  const skip = (action, detail) => ({ ok: false, action, detail });

  if (!isInsideGitWorkTree(gitCwd)) {
    return skip(
      "skipped_no_local_repo",
      `${gitCwd} is not a git work tree; cannot run local CI resolver`,
    );
  }
  if (!originRemoteMatchesRepository(gitCwd, owner, repo)) {
    return skip("skipped_origin_mismatch", `origin in ${gitCwd} does not match ${owner}/${repo}`);
  }
  if (!hasClaudeCli()) {
    return skip(
      "skipped_no_claude_cli",
      "`claude` CLI not on PATH (install Claude Code); cannot run local CI resolver",
    );
  }

  const headRef = prMerge.head?.ref;
  const baseRef = prMerge.base?.ref;
  if (!headRef || !baseRef) {
    return skip("skipped_missing_refs", "PR head or base ref missing");
  }

  const { byRunId, noActionsRun } = partitionFailedRuns(checkRuns);
  if (byRunId.length === 0 && noActionsRun.length === 0) {
    return skip("skipped_no_failures", "no failed check runs to act on");
  }

  if (options?.dryRun) {
    return {
      ok: true,
      action: "dry_run",
      detail: `Would acquire CI resolver lock for PR #${prMerge.number}, spawn detached resolver-runner to create worktree from origin/${headRef}, fetch ${byRunId.length} failed-run log(s), and run \`claude -p\` to fix failures and push.`,
    };
  }

  const lock = tryAcquireResolverLock({
    gitCwd,
    kind: RESOLVER_KIND_CI,
    prNumber: prMerge.number,
  });
  if (!lock.ok) {
    return { ok: false, action: lock.action, detail: lock.detail };
  }

  const spawnResult = spawnResolverChild(lock, { owner, repo, gitCwd });
  if (!spawnResult.ok) {
    lock.release();
    return { ok: false, action: spawnResult.action, detail: spawnResult.detail };
  }

  return {
    ok: true,
    action: "started_in_background",
    worktree: lock.worktreePath,
    pid: spawnResult.pid,
    logFile: spawnResult.logFile,
    detail: `Spawned CI resolver-runner (pid ${spawnResult.pid}) in background; result will land at ${lock.resultFilePath} when claude exits. Log: ${spawnResult.logFile}`,
  };
}

/**
 * The actual CI-fix work, invoked by resolver-runner.mjs in the detached child. Re-fetches
 * check runs (in case state shifted since the parent decided to spawn), pulls failed-job
 * logs from GitHub Actions, builds the prompt, runs `claude -p`, then returns the result
 * to the runner which writes `.result-pr-N.json` and removes the lock.
 *
 * @param {{ owner: string, repo: string, prMerge: Record<string, unknown>, gitCwd: string, worktreePath: string }} args
 * @returns {Promise<{ ok: boolean, action: string, detail?: string }>}
 */
export async function executeCiResolverWork({ owner, repo, prMerge, gitCwd, worktreePath }) {
  const headRef = prMerge.head?.ref;
  const baseRef = prMerge.base?.ref;
  if (!headRef || !baseRef) {
    return { ok: false, action: "skipped_missing_refs", detail: "PR head or base ref missing in runner" };
  }
  const headSha = prMerge.head?.sha;
  if (!headSha) {
    return { ok: false, action: "skipped_missing_refs", detail: "PR head SHA missing in runner" };
  }
  const skip = (action, detail) => ({ ok: false, action, detail });

  // Re-fetch check runs — the parent's view may be stale by the time we run.
  let checkRuns;
  try {
    checkRuns = await fetchCheckRunsForSha(owner, repo, headSha);
  } catch (e) {
    return skip("check_runs_fetch_failed", `failed to refetch check runs: ${(e && e.message) || e}`);
  }
  const { byRunId, noActionsRun } = partitionFailedRuns(checkRuns);
  if (byRunId.length === 0 && noActionsRun.length === 0) {
    return skip(
      "skipped_no_failures",
      "no failed check runs on head SHA at runner start (resolved upstream while we waited?)",
    );
  }

  try {
    gitInRepo(gitCwd, ["fetch", "origin", headRef]);
  } catch (e) {
    return skip("fetch_failed", `git fetch origin ${headRef}: ${(e && e.message) || e}`);
  }

  const resolverBranch = `claude/ci-fix/pr-${prMerge.number}`;
  try {
    gitInRepo(gitCwd, [
      "worktree",
      "add",
      "-B",
      resolverBranch,
      worktreePath,
      `remotes/origin/${headRef}`,
    ]);
  } catch (e) {
    return skip(
      "worktree_add_failed",
      `git worktree add ${worktreePath}: ${(e && e.message) || e}`,
    );
  }

  /** @type {Record<string, string>} */
  const logsByRunId = {};
  for (const entry of byRunId) {
    logsByRunId[entry.run_id] = fetchFailedRunLog(owner, repo, entry.run_id);
  }

  const prompt = buildCiFailurePrompt({
    prMerge,
    headRef,
    baseRef,
    byRunId,
    noActionsRun,
    logsByRunId,
  });

  try {
    execFileSync(
      "claude",
      [
        "-p",
        prompt,
        "--allowedTools",
        CI_RESOLVER_ALLOWED_TOOLS.join(","),
        "--permission-mode",
        "acceptEdits",
      ],
      {
        cwd: worktreePath,
        stdio: "inherit",
        timeout: LOCAL_CLAUDE_TIMEOUT_MS,
      },
    );
  } catch (e) {
    return skip(
      "claude_invocation_failed",
      `claude -p exited non-zero or timed out: ${(e && e.message) || e}`,
    );
  }

  return {
    ok: true,
    action: "claude_invoked",
    worktree: worktreePath,
    failed_run_count: byRunId.length,
    detail: `Ran \`claude -p\` in ${worktreePath} to fix ${byRunId.length} failed run(s) on PR #${prMerge.number}.`,
  };
}

/** True when the local CI resolver actually took ownership of the failures for this row. */
export function localCiResolutionTookOver(row) {
  return row?.local_ci_resolution?.ok === true;
}
