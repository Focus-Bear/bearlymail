import { execFileSync } from "node:child_process";

import { LOCAL_CLAUDE_ALLOWED_TOOLS, LOCAL_CLAUDE_TIMEOUT_MS } from "./constants.mjs";
import { gitInRepo, isInsideGitWorkTree, originRemoteMatchesRepository } from "./git-local.mjs";
import {
  RESOLVER_KIND_CONFLICT,
  hasClaudeCli,
  spawnResolverChild,
  tryAcquireResolverLock,
} from "./resolver-lock.mjs";

// Re-export so existing callers (cli.mjs, etc.) keep working without an import shuffle.
export { hasClaudeCli };

/** True when the local resolver actually took ownership of the conflict for this row. */
export function localConflictResolutionTookOver(row) {
  return row?.local_conflict_resolution?.ok === true;
}

export function buildLocalClaudeConflictPrompt(prMerge, headRef, baseRef) {
  return [
    `You are resolving a merge conflict on pull request #${prMerge.number}: ${prMerge.title ?? "(no title)"}.`,
    "",
    "Context:",
    "- This isolated git worktree was created by scripts/pr-claude-triage.mjs.",
    `- \`origin/${baseRef}\` was merge-attempted into \`origin/${headRef}\` and produced conflicts.`,
    "- Conflict markers are present in the working tree right now.",
    "- Start by running `git status` to see the conflicted files.",
    "",
    "Tasks:",
    "1. Resolve every `<<<<<<<` / `=======` / `>>>>>>>` block by integrating both sides correctly.",
    "2. Do NOT change behaviour beyond what is required to integrate the merge — no refactors, no drive-by fixes.",
    "3. Stage the resolved files: `git add -A`.",
    `4. Commit with: \`git commit -m "Merge ${baseRef} into ${headRef} — resolve conflicts"\`.`,
    `5. Push the resolved tip back to the PR branch: \`git push origin HEAD:${headRef}\`.`,
    "",
    "If a conflict is genuinely ambiguous, leave the markers in place, do NOT commit, and exit with a brief explanation so a human can take over.",
  ].join("\n");
}

/**
 * When a PR has a merge conflict and a usable local clone is available, set up an
 * isolated git worktree, attempt the base-branch merge so conflict markers land in
 * the tree, and run `claude -p` non-interactively to resolve and push.
 *
 * Falls back to `{ ok: false }` when prerequisites are missing (no local clone,
 * origin mismatch, no `claude` CLI). The caller keeps the existing @claude github
 * triage behaviour in those cases.
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   action: string,
 *   detail?: string,
 *   worktree?: string,
 * }>}
 */
export async function maybeResolveConflictWithLocalClaude(owner, repo, prMerge, gitCwd, options) {
  const skip = (action, detail) => ({ ok: false, action, detail });

  if (!isInsideGitWorkTree(gitCwd)) {
    return skip(
      "skipped_no_local_repo",
      `${gitCwd} is not a git work tree; cannot run local conflict resolution`,
    );
  }
  if (!originRemoteMatchesRepository(gitCwd, owner, repo)) {
    return skip(
      "skipped_origin_mismatch",
      `origin in ${gitCwd} does not match ${owner}/${repo}`,
    );
  }
  if (!hasClaudeCli()) {
    return skip(
      "skipped_no_claude_cli",
      "`claude` CLI not on PATH (install Claude Code); cannot run local conflict resolution",
    );
  }

  const headRef = prMerge.head?.ref;
  const baseRef = prMerge.base?.ref;
  if (!headRef || !baseRef) {
    return skip("skipped_missing_refs", "PR head or base ref missing");
  }

  if (options?.dryRun) {
    return {
      ok: true,
      action: "dry_run",
      detail: `Would acquire conflict resolver lock for PR #${prMerge.number}, spawn detached resolver-runner that creates worktree from origin/${headRef}, attempts merge of origin/${baseRef}, then runs \`claude -p\` to resolve conflicts and push to ${headRef}.`,
    };
  }

  const lock = tryAcquireResolverLock({
    gitCwd,
    kind: RESOLVER_KIND_CONFLICT,
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
    detail: `Spawned conflict resolver-runner (pid ${spawnResult.pid}) in background; result will land at ${lock.resultFilePath} when claude exits. Log: ${spawnResult.logFile}`,
  };
}

/**
 * The actual conflict-resolution work, invoked by resolver-runner.mjs in the detached
 * child process. Performs: fetch refs → add worktree → attempt merge → run `claude -p`
 * with conflict markers in the tree → push the resolved tip. Returns a result object;
 * the caller (runner) writes it to `.result-pr-N.json` and cleans up worktree + lock.
 *
 * @param {{ owner: string, repo: string, prMerge: Record<string, unknown>, gitCwd: string, worktreePath: string }} args
 * @returns {Promise<{ ok: boolean, action: string, detail?: string }>}
 */
export async function executeConflictResolverWork({ prMerge, gitCwd, worktreePath }) {
  const headRef = prMerge.head?.ref;
  const baseRef = prMerge.base?.ref;
  if (!headRef || !baseRef) {
    return { ok: false, action: "skipped_missing_refs", detail: "PR head or base ref missing in runner" };
  }
  const resolverBranch = `claude/resolve-conflicts/pr-${prMerge.number}`;
  const skip = (action, detail) => ({ ok: false, action, detail });
  try {
    gitInRepo(gitCwd, ["fetch", "origin", headRef, baseRef]);
  } catch (e) {
    return skip(
      "fetch_failed",
      `git fetch origin ${headRef} ${baseRef}: ${(e && e.message) || e}`,
    );
  }

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

  // Attempt the merge inside the worktree. Non-zero exit on conflict is expected —
  // conflict markers in the tree are exactly what we want claude to land in.
  let mergeOutcome;
  try {
    execFileSync(
      "git",
      ["merge", "--no-commit", "--no-edit", `remotes/origin/${baseRef}`],
      { cwd: worktreePath, stdio: "ignore" },
    );
    mergeOutcome = "clean";
  } catch {
    mergeOutcome = "conflicting";
  }

  if (mergeOutcome === "clean") {
    // Github reported a conflict but a fresh fetch+merge succeeded — likely a stale
    // API snapshot. Commit and push the merge directly; claude doesn't need to run.
    try {
      execFileSync("git", ["commit", "--no-edit"], {
        cwd: worktreePath,
        stdio: "inherit",
      });
      execFileSync("git", ["push", "origin", `HEAD:${headRef}`], {
        cwd: worktreePath,
        stdio: "inherit",
      });
      return {
        ok: true,
        action: "merged_without_conflicts",
        worktree: worktreePath,
        detail: `origin/${baseRef} merged cleanly into origin/${headRef} on a fresh fetch; pushed to ${headRef} without invoking claude.`,
      };
    } catch (e) {
      return skip(
        "clean_merge_push_failed",
        `commit/push of clean merge failed: ${(e && e.message) || e}`,
      );
    }
  }

  const prompt = buildLocalClaudeConflictPrompt(prMerge, headRef, baseRef);
  const allowedTools = LOCAL_CLAUDE_ALLOWED_TOOLS.join(",");

  try {
    execFileSync(
      "claude",
      [
        "-p",
        prompt,
        "--allowedTools",
        allowedTools,
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
    detail: `Ran \`claude -p\` in ${worktreePath} to resolve conflicts on PR #${prMerge.number} (origin/${baseRef} → origin/${headRef}).`,
  };
}
