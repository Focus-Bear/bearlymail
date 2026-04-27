import { execFileSync } from "node:child_process";

import { LOCAL_CLAUDE_ALLOWED_TOOLS, LOCAL_CLAUDE_TIMEOUT_MS } from "./constants.mjs";
import { gitInRepo, isInsideGitWorkTree, originRemoteMatchesRepository } from "./git-local.mjs";

/** True when `claude` (Claude Code CLI) is callable on the current PATH. */
export function hasClaudeCli() {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

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

  const worktreePath = `${gitCwd.replace(/\/$/, "")}/.claude/worktrees/conflict-pr-${prMerge.number}`;
  const resolverBranch = `claude/resolve-conflicts/pr-${prMerge.number}`;

  if (options?.dryRun) {
    return {
      ok: true,
      action: "dry_run",
      worktree: worktreePath,
      detail: `Would create worktree ${worktreePath} from origin/${headRef}, attempt merge of origin/${baseRef}, then run \`claude -p\` to resolve conflicts and push to ${headRef}.`,
    };
  }

  // Best-effort cleanup of any previous attempt at the same path.
  try {
    gitInRepo(gitCwd, ["worktree", "remove", "--force", worktreePath]);
  } catch {
    /* not a registered worktree, continue */
  }

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
