/**
 * Local `claude -p` resolver for unresolved Gemini Code Assist review threads.
 *
 * Triggered when a PR has at least one unresolved Gemini inline review thread
 * that is not already waived (by the all-gemini-feedback-actioned label or a
 * Claude attestation comment). Sets up an isolated git worktree from
 * `origin/{headRef}`, fetches each thread's full context (path, line range,
 * diff hunk, comment body, thread ID), and runs `claude -p` with a prompt
 * asking Claude to address each thread in code.
 *
 * After Claude exits cleanly (commit + push), this resolver also calls the
 * GraphQL `resolveReviewThread` mutation for each thread. Per the user's
 * direction (2026-05-07): trust Claude's judgement — resolve all threads, do
 * not require per-thread "addressed" attestation.
 *
 * Returns `{ ok: false, action: ... }` if prerequisites are missing (no clone,
 * origin mismatch, no claude CLI, lock contention) or the invocation fails.
 */

import { execFileSync } from "node:child_process";

import { LOCAL_CLAUDE_TIMEOUT_MS } from "./constants.mjs";
import { threadHasGeminiComment } from "./gemini.mjs";
import {
  isInsideGitWorkTree,
  originRemoteMatchesRepository,
  gitInRepo,
} from "./git-local.mjs";
import { graphql } from "./github.mjs";
import {
  RESOLVER_KIND_GEMINI,
  hasClaudeCli,
  spawnResolverChild,
  tryAcquireResolverLock,
} from "./resolver-lock.mjs";

const GEMINI_RESOLVER_ALLOWED_TOOLS = [
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

/**
 * Same fields as REVIEW_THREADS_QUERY in constants.mjs but returns thread `id` (needed
 * for the `resolveReviewThread` mutation) and the per-comment `diffHunk` (gives Claude
 * the surrounding context). Kept local because the rollup query (gemini.mjs) is on the
 * hot path and we don't want to bloat its payload.
 */
const RESOLVER_REVIEW_THREADS_QUERY = `
query GeminiThreadsForResolver($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          originalLine
          diffSide
          comments(first: 50) {
            nodes {
              id
              author { login }
              body
              diffHunk
            }
          }
        }
      }
    }
  }
}
`;

const RESOLVE_REVIEW_THREAD_MUTATION = `
mutation ResolveReviewThread($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}
`;

/**
 * Returns the list of unresolved Gemini threads with full data needed to drive the
 * resolver: thread id, path, line/start/end, the first Gemini comment body and its
 * diffHunk. Skips outdated threads (the diff has moved past them).
 */
export async function fetchGeminiResolverThreads(owner, repo, prNumber, bots) {
  /** @type {Array<{
   *   thread_id: string,
   *   path: string | null,
   *   line: number | null,
   *   startLine: number | null,
   *   originalLine: number | null,
   *   diffSide: string | null,
   *   first_gemini_body: string,
   *   first_gemini_diff_hunk: string,
   *   comment_chain: Array<{ login: string, body: string }>,
   * }>} */
  const out = [];

  let after = null;
  for (;;) {
    const data = await graphql(RESOLVER_REVIEW_THREADS_QUERY, {
      owner,
      name: repo,
      number: prNumber,
      after,
    });
    const conn = data?.repository?.pullRequest?.reviewThreads;
    const nodes = conn?.nodes ?? [];
    for (const node of nodes) {
      if (node.isResolved) continue;
      if (node.isOutdated) continue;
      if (!threadHasGeminiComment(node, bots)) continue;
      const comments = node.comments?.nodes ?? [];
      const firstGemini = comments.find(
        (c) => c?.author?.login && bots.has(c.author.login),
      );
      if (!firstGemini) continue;
      out.push({
        thread_id: node.id,
        path: node.path ?? null,
        line: typeof node.line === "number" ? node.line : null,
        startLine: typeof node.startLine === "number" ? node.startLine : null,
        originalLine: typeof node.originalLine === "number" ? node.originalLine : null,
        diffSide: typeof node.diffSide === "string" ? node.diffSide : null,
        first_gemini_body: typeof firstGemini.body === "string" ? firstGemini.body : "",
        first_gemini_diff_hunk:
          typeof firstGemini.diffHunk === "string" ? firstGemini.diffHunk : "",
        comment_chain: comments.map((c) => ({
          login: c?.author?.login ?? "",
          body: typeof c?.body === "string" ? c.body : "",
        })),
      });
    }
    const pi = conn?.pageInfo;
    if (!pi?.hasNextPage) break;
    after = pi.endCursor;
  }

  return out;
}

function formatLineRange(t) {
  if (t.startLine != null && t.line != null && t.startLine !== t.line) {
    return `${t.startLine}-${t.line}`;
  }
  if (t.line != null) return String(t.line);
  if (t.originalLine != null) return `${t.originalLine} (original)`;
  return "?";
}

export function buildGeminiFeedbackPrompt({ prMerge, headRef, threads }) {
  const lines = [
    `You are addressing Gemini Code Assist review feedback on pull request #${prMerge.number}: ${prMerge.title ?? "(no title)"}.`,
    "",
    "Context:",
    "- This isolated git worktree was created by scripts/pr-claude-triage.mjs.",
    `- The branch checked out is \`${headRef}\` at the same SHA as the PR head.`,
    `- ${threads.length} unresolved Gemini review thread(s) on the diff. Each is shown below with the file, line range, the Gemini comment, and the diff hunk Gemini was looking at.`,
    "- After you finish, the wrapper script will mark every Gemini thread Resolved on GitHub. You do NOT need to call any GitHub API yourself.",
    "",
    "Threads:",
  ];
  threads.forEach((t, i) => {
    lines.push("");
    lines.push(`### Thread ${i + 1}`);
    lines.push(`- file: \`${t.path ?? "(unknown)"}\``);
    lines.push(`- lines: ${formatLineRange(t)} (${t.diffSide ?? "RIGHT"})`);
    lines.push("- Gemini comment:");
    lines.push("  ```");
    lines.push(
      t.first_gemini_body
        .split("\n")
        .map((ln) => `  ${ln}`)
        .join("\n"),
    );
    lines.push("  ```");
    if (t.first_gemini_diff_hunk) {
      lines.push("- diff hunk Gemini was reviewing:");
      lines.push("  ```diff");
      lines.push(
        t.first_gemini_diff_hunk
          .split("\n")
          .map((ln) => `  ${ln}`)
          .join("\n"),
      );
      lines.push("  ```");
    }
  });
  lines.push("");
  lines.push("Tasks:");
  lines.push(
    "1. For each Gemini thread, decide whether the feedback is correct. If yes, fix it in the code on this branch. If you intentionally disagree with a thread, leave the code as-is — that's a valid outcome.",
  );
  lines.push(
    "2. Do NOT change behaviour beyond what each Gemini comment requires. No drive-by refactors, no formatting passes on unrelated code.",
  );
  lines.push(
    "3. When fixes are ready, stage them: `git add -A`. Commit with: `git commit -m \"chore(gemini): address review feedback\"`.",
  );
  lines.push(`4. Push to the PR branch: \`git push origin HEAD:${headRef}\`.`);
  lines.push(
    "5. If you did not change any code (every thread you reviewed was either already addressed or you intentionally disagreed), do NOT create an empty commit — exit cleanly. The wrapper will still mark threads resolved.",
  );
  lines.push("");
  lines.push(
    "If a thread is genuinely ambiguous (you cannot tell what Gemini means without more context), leave the relevant code alone and write a one-line note in the commit message explaining what you skipped. The thread will still be marked resolved.",
  );
  return lines.join("\n");
}

/**
 * Best-effort: marks every passed-in thread as Resolved via GraphQL. Does not throw on
 * individual failures (e.g. permission, already resolved, deleted) — collects them and
 * returns counts.
 *
 * @param {Array<{ thread_id: string, path: string | null }>} threads
 * @returns {Promise<{ resolved: number, errors: Array<{ thread_id: string, detail: string }> }>}
 */
export async function resolveAllGeminiThreads(threads) {
  let resolved = 0;
  /** @type {Array<{ thread_id: string, detail: string }>} */
  const errors = [];
  for (const t of threads) {
    try {
      await graphql(RESOLVE_REVIEW_THREAD_MUTATION, { threadId: t.thread_id });
      resolved += 1;
    } catch (e) {
      errors.push({
        thread_id: t.thread_id,
        detail: (e && e.message ? String(e.message) : String(e)).slice(0, 300),
      });
    }
  }
  return { resolved, errors };
}

/**
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   action: string,
 *   detail?: string,
 *   worktree?: string,
 *   threads_resolved?: number,
 *   thread_resolve_errors?: Array<{ thread_id: string, detail: string }>,
 * }>}
 */
export async function maybeResolveGeminiFeedbackWithLocalClaude(
  owner,
  repo,
  prMerge,
  gitCwd,
  geminiBots,
  options,
) {
  const skip = (action, detail) => ({ ok: false, action, detail });

  if (!isInsideGitWorkTree(gitCwd)) {
    return skip(
      "skipped_no_local_repo",
      `${gitCwd} is not a git work tree; cannot run local Gemini resolver`,
    );
  }
  if (!originRemoteMatchesRepository(gitCwd, owner, repo)) {
    return skip("skipped_origin_mismatch", `origin in ${gitCwd} does not match ${owner}/${repo}`);
  }
  if (!hasClaudeCli()) {
    return skip(
      "skipped_no_claude_cli",
      "`claude` CLI not on PATH (install Claude Code); cannot run local Gemini resolver",
    );
  }

  const headRef = prMerge.head?.ref;
  if (!headRef) {
    return skip("skipped_missing_refs", "PR head ref missing");
  }

  const threads = await fetchGeminiResolverThreads(owner, repo, prMerge.number, geminiBots);
  if (threads.length === 0) {
    return skip("skipped_no_threads", "no unresolved Gemini threads (all already resolved or outdated)");
  }

  if (options?.dryRun) {
    return {
      ok: true,
      action: "dry_run",
      detail: `Would acquire Gemini resolver lock for PR #${prMerge.number}, spawn detached resolver-runner to create worktree from origin/${headRef}, run \`claude -p\` against ${threads.length} unresolved Gemini thread(s), then mark all ${threads.length} thread(s) Resolved via GraphQL.`,
    };
  }

  const lock = tryAcquireResolverLock({
    gitCwd,
    kind: RESOLVER_KIND_GEMINI,
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
    pending_threads: threads.length,
    detail: `Spawned Gemini resolver-runner (pid ${spawnResult.pid}) in background for ${threads.length} thread(s); result will land at ${lock.resultFilePath} when claude exits. Log: ${spawnResult.logFile}`,
  };
}

/**
 * The actual Gemini work, invoked by resolver-runner.mjs in the detached child. Re-fetches
 * unresolved Gemini threads (in case the set shifted), runs `claude -p`, then marks every
 * thread Resolved via the GraphQL `resolveReviewThread` mutation. Trust Claude's judgement
 * per user direction (2026-05-07).
 *
 * @param {{ owner: string, repo: string, prMerge: Record<string, unknown>, gitCwd: string, worktreePath: string, geminiBots: Set<string> }} args
 * @returns {Promise<{ ok: boolean, action: string, detail?: string, threads_resolved?: number, thread_resolve_errors?: Array<{ thread_id: string, detail: string }> }>}
 */
export async function executeGeminiResolverWork({
  owner,
  repo,
  prMerge,
  gitCwd,
  worktreePath,
  geminiBots,
}) {
  const headRef = prMerge.head?.ref;
  if (!headRef) {
    return { ok: false, action: "skipped_missing_refs", detail: "PR head ref missing in runner" };
  }
  const skip = (action, detail) => ({ ok: false, action, detail });

  const threads = await fetchGeminiResolverThreads(owner, repo, prMerge.number, geminiBots);
  if (threads.length === 0) {
    return skip(
      "skipped_no_threads",
      "no unresolved Gemini threads at runner start (resolved upstream while we waited?)",
    );
  }

  try {
    gitInRepo(gitCwd, ["fetch", "origin", headRef]);
  } catch (e) {
    return skip("fetch_failed", `git fetch origin ${headRef}: ${(e && e.message) || e}`);
  }

  const resolverBranch = `claude/gemini-fix/pr-${prMerge.number}`;
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

  const prompt = buildGeminiFeedbackPrompt({ prMerge, headRef, threads });

  try {
    execFileSync(
      "claude",
      [
        "-p",
        prompt,
        "--allowedTools",
        GEMINI_RESOLVER_ALLOWED_TOOLS.join(","),
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

  // Trust Claude's judgement (per user direction): resolve every thread we showed it.
  const resolveResult = await resolveAllGeminiThreads(threads);

  return {
    ok: true,
    action: "claude_invoked",
    worktree: worktreePath,
    threads_shown: threads.length,
    threads_resolved: resolveResult.resolved,
    thread_resolve_errors: resolveResult.errors,
    detail: `Ran \`claude -p\` in ${worktreePath} on ${threads.length} Gemini thread(s); resolved ${resolveResult.resolved}/${threads.length} via GraphQL${
      resolveResult.errors.length ? ` (${resolveResult.errors.length} resolve error(s))` : ""
    }.`,
  };
}

/** True when the local Gemini resolver actually took ownership for this row. */
export function localGeminiResolutionTookOver(row) {
  return row?.local_gemini_resolution?.ok === true;
}
