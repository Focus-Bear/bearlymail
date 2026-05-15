#!/usr/bin/env node
/**
 * Detached child entrypoint for the three local `claude -p` resolvers.
 *
 * Spawned by the parent (cli.mjs) via `spawn(..., { detached: true, stdio: [..., logFd, logFd] })`
 * so the parent can return immediately after firing one or more resolvers. Each instance owns
 * a single PR worktree, does the actual resolver work synchronously, then writes a result
 * file and removes the lockfile so the next cron tick can pick up the outcome.
 *
 * Invocation:
 *   node resolver-runner.mjs \
 *     --kind=<conflict|ci|gemini> \
 *     --owner=Focus-Bear --repo=BearlyMail \
 *     --git-cwd=/path/to/clone \
 *     --pr-number=2039 \
 *     --worktree-path=/path/.claude/worktrees/<kind>-pr-2039 \
 *     --lock-file=/path/.claude/worktrees/.lock-pr-2039.json \
 *     --result-file=/path/.claude/worktrees/.result-pr-2039.json
 *
 * Exit code is informational; the parent only consumes the result file (next tick).
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { executeCiResolverWork } from "./ci-failure-resolver.mjs";
import { executeConflictResolverWork } from "./conflict-resolver.mjs";
import { executeGeminiResolverWork } from "./gemini-feedback-resolver.mjs";
import { geminiBotSet } from "./gemini.mjs";
import { ensureGithubTokenFromGhCli, githubRest } from "./github.mjs";
import { safeRemoveResolverArtifacts } from "./resolver-lock.mjs";

function parseRunnerArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    if (a.startsWith("--") && eq > 0) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else if (a.startsWith("--")) {
      out[a.slice(2)] = argv[++i];
    }
  }
  return out;
}

function writeResultAndExit({ resultFile, lockFile, gitCwd, worktreePath, payload, exitCode }) {
  try {
    fs.writeFileSync(
      resultFile,
      JSON.stringify({ ...payload, finishedAt: new Date().toISOString() }, null, 2),
    );
  } catch (e) {
    console.error(`[runner] failed to write result file ${resultFile}: ${(e && e.message) || e}`);
  }
  // Worktree + lock cleanup. Even on failure, we clear the lock so the next tick can retry.
  try {
    safeRemoveResolverArtifacts({ gitCwd, worktreePath, lockFile });
  } catch (e) {
    console.error(`[runner] cleanup error: ${(e && e.message) || e}`);
  }
  process.exit(exitCode);
}

async function main() {
  ensureGithubTokenFromGhCli();
  const args = parseRunnerArgs(process.argv);

  const required = [
    "kind",
    "owner",
    "repo",
    "git-cwd",
    "pr-number",
    "worktree-path",
    "lock-file",
    "result-file",
  ];
  for (const k of required) {
    if (!args[k]) {
      console.error(`[runner] missing required arg: --${k}`);
      process.exit(64);
    }
  }

  const kind = args.kind;
  const owner = args.owner;
  const repo = args.repo;
  const gitCwd = args["git-cwd"];
  const prNumber = parseInt(args["pr-number"], 10);
  const worktreePath = path.resolve(args["worktree-path"]);
  const lockFile = path.resolve(args["lock-file"]);
  const resultFile = path.resolve(args["result-file"]);

  console.log(
    `=== resolver-runner started pid=${process.pid} kind=${kind} pr=${prNumber} at ${new Date().toISOString()} ===`,
  );

  let prMerge;
  try {
    prMerge = await githubRest(`/repos/${owner}/${repo}/pulls/${prNumber}`);
  } catch (e) {
    writeResultAndExit({
      resultFile,
      lockFile,
      gitCwd,
      worktreePath,
      payload: {
        kind,
        prNumber,
        ok: false,
        action: "pr_fetch_failed",
        detail: `failed to GET pulls/${prNumber}: ${(e && e.message) || e}`,
      },
      exitCode: 1,
    });
    return;
  }

  let payload;
  try {
    if (kind === "conflict") {
      const r = await executeConflictResolverWork({
        owner,
        repo,
        prMerge,
        gitCwd,
        worktreePath,
      });
      payload = { kind, prNumber, ...r };
    } else if (kind === "ci") {
      const r = await executeCiResolverWork({
        owner,
        repo,
        prMerge,
        gitCwd,
        worktreePath,
      });
      payload = { kind, prNumber, ...r };
    } else if (kind === "gemini") {
      const r = await executeGeminiResolverWork({
        owner,
        repo,
        prMerge,
        gitCwd,
        worktreePath,
        geminiBots: geminiBotSet(),
      });
      payload = { kind, prNumber, ...r };
    } else {
      payload = {
        kind,
        prNumber,
        ok: false,
        action: "unknown_kind",
        detail: `unknown resolver kind: ${kind}`,
      };
    }
  } catch (e) {
    payload = {
      kind,
      prNumber,
      ok: false,
      action: "runner_threw",
      detail: (e && e.stack ? String(e.stack) : String(e)).slice(0, 2000),
    };
  }

  console.log(
    `=== resolver-runner finished pid=${process.pid} kind=${kind} pr=${prNumber} ok=${payload.ok} action=${payload.action} at ${new Date().toISOString()} ===`,
  );

  writeResultAndExit({
    resultFile,
    lockFile,
    gitCwd,
    worktreePath,
    payload,
    exitCode: payload.ok ? 0 : 1,
  });
}

main().catch((err) => {
  console.error("[runner] uncaught:", err);
  process.exit(1);
});
