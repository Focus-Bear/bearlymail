/**
 * Shared concurrency + per-branch lock for the local `claude -p` resolvers
 * (conflict, ci-failure, gemini-feedback). Each acquired lock owns one git
 * worktree under `.claude/worktrees/<kind>-pr-<N>` and is recorded by a
 * sibling lockfile `.claude/worktrees/.lock-pr-<N>.json` containing the PID.
 *
 * Rules:
 *   1. At most one resolver may hold a lock for a given PR at a time
 *      (regardless of resolver kind).
 *   2. At most MAX_CONCURRENT_RESOLVERS resolvers may hold locks across all
 *      PRs at once on this machine.
 *   3. A lockfile whose PID is no longer alive is treated as stale and is
 *      cleaned up on the next acquire attempt (worktree removed, lockfile
 *      deleted) before the cap and per-branch checks run.
 */

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { gitInRepo } from "./git-local.mjs";

export const RESOLVER_KIND_CONFLICT = "conflict";
export const RESOLVER_KIND_CI = "ci";
export const RESOLVER_KIND_GEMINI = "gemini";
export const RESOLVER_KINDS = [
  RESOLVER_KIND_CONFLICT,
  RESOLVER_KIND_CI,
  RESOLVER_KIND_GEMINI,
];

/** Max concurrent resolvers across all PRs on this machine. Override with PR_TRIAGE_MAX_CONCURRENT_RESOLVERS. */
export function getMaxConcurrentResolvers() {
  const raw = (process.env.PR_TRIAGE_MAX_CONCURRENT_RESOLVERS ?? "").trim();
  if (raw && /^[1-9]\d*$/.test(raw)) return parseInt(raw, 10);
  return 5;
}

function worktreesDir(gitCwd) {
  return path.join(gitCwd.replace(/\/$/, ""), ".claude", "worktrees");
}

function lockFilePath(gitCwd, prNumber) {
  return path.join(worktreesDir(gitCwd), `.lock-pr-${prNumber}.json`);
}

function resultFilePath(gitCwd, prNumber) {
  return path.join(worktreesDir(gitCwd), `.result-pr-${prNumber}.json`);
}

function worktreePathFor(gitCwd, kind, prNumber) {
  return path.join(worktreesDir(gitCwd), `${kind}-pr-${prNumber}`);
}

function resolverLogPath(prNumber, kind) {
  const logDir = path.join(os.homedir(), "Library", "Logs", "pr-claude-triage");
  return path.join(
    logDir,
    `resolver-pr-${prNumber}-${kind}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
  );
}

function isProcessAlive(pid) {
  if (typeof pid !== "number" || !Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === "EPERM"; // exists, no permission to signal
  }
}

function readLockFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

function safeRemoveWorktree(gitCwd, worktreePath) {
  try {
    gitInRepo(gitCwd, ["worktree", "remove", "--force", worktreePath]);
  } catch {
    /* not a registered worktree, or already gone — fall through to rmdir */
  }
  try {
    fs.rmSync(worktreePath, { recursive: true, force: true });
  } catch {
    /* nothing left to remove */
  }
}

function safeRemoveLockFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* gone already */
  }
}

/** Cleanup helper exposed to the runner child so it can release the lock + worktree on exit. */
export function safeRemoveResolverArtifacts({ gitCwd, worktreePath, lockFile }) {
  if (worktreePath) safeRemoveWorktree(gitCwd, worktreePath);
  if (lockFile) safeRemoveLockFile(lockFile);
}

/**
 * Scan the lock directory, drop stale locks (dead PID), and return the live ones.
 * @param {string} gitCwd
 * @returns {Array<{ kind: string, prNumber: number, pid: number, startedAt: string, worktreePath: string, lockFilePath: string }>}
 */
export function listActiveResolvers(gitCwd) {
  const dir = worktreesDir(gitCwd);
  if (!fs.existsSync(dir)) return [];

  /** @type {Array<{ kind: string, prNumber: number, pid: number, startedAt: string, worktreePath: string, lockFilePath: string }>} */
  const live = [];

  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }

  for (const name of entries) {
    const m = name.match(/^\.lock-pr-(\d+)\.json$/);
    if (!m) continue;
    const prNumber = parseInt(m[1], 10);
    const lockPath = path.join(dir, name);
    const lock = readLockFile(lockPath);

    if (
      !lock ||
      typeof lock.pid !== "number" ||
      typeof lock.kind !== "string" ||
      !RESOLVER_KINDS.includes(lock.kind)
    ) {
      // unparseable / unknown — treat as stale
      const orphanedWorktree = worktreePathFor(gitCwd, lock?.kind ?? "conflict", prNumber);
      safeRemoveWorktree(gitCwd, orphanedWorktree);
      safeRemoveLockFile(lockPath);
      continue;
    }

    if (!isProcessAlive(lock.pid)) {
      // stale: clean both worktree and lockfile so the next tick can re-acquire
      safeRemoveWorktree(gitCwd, worktreePathFor(gitCwd, lock.kind, prNumber));
      safeRemoveLockFile(lockPath);
      continue;
    }

    live.push({
      kind: lock.kind,
      prNumber,
      pid: lock.pid,
      startedAt: typeof lock.startedAt === "string" ? lock.startedAt : "",
      worktreePath: worktreePathFor(gitCwd, lock.kind, prNumber),
      lockFilePath: lockPath,
    });
  }

  return live;
}

/**
 * Try to reserve a lock for `{ kind, prNumber }`. Cleans up stale locks first, then
 * enforces per-branch uniqueness and the global concurrency cap.
 *
 * The returned worktree path is **not** created here — the caller (the resolver)
 * runs `git worktree add` for it. The lockfile **is** created here so concurrent
 * cron ticks see the reservation immediately.
 *
 * @param {{ gitCwd: string, kind: string, prNumber: number }} args
 * @returns {{ ok: true, worktreePath: string, lockFilePath: string, release: () => void }
 *          | { ok: false, action: "skipped_branch_locked" | "skipped_concurrency_cap", detail: string, active: ReturnType<typeof listActiveResolvers> }}
 */
export function tryAcquireResolverLock({ gitCwd, kind, prNumber }) {
  if (!RESOLVER_KINDS.includes(kind)) {
    throw new Error(`Unknown resolver kind: ${kind}`);
  }

  const dir = worktreesDir(gitCwd);
  fs.mkdirSync(dir, { recursive: true });

  const active = listActiveResolvers(gitCwd);

  const sameBranch = active.find((a) => a.prNumber === prNumber);
  if (sameBranch) {
    return {
      ok: false,
      action: "skipped_branch_locked",
      detail: `PR #${prNumber} is already being handled by the ${sameBranch.kind} resolver (pid ${sameBranch.pid}, started ${sameBranch.startedAt})`,
      active,
    };
  }

  const cap = getMaxConcurrentResolvers();
  if (active.length >= cap) {
    return {
      ok: false,
      action: "skipped_concurrency_cap",
      detail: `${active.length}/${cap} resolvers already running on this machine; deferring PR #${prNumber} to next tick`,
      active,
    };
  }

  const lockPath = lockFilePath(gitCwd, prNumber);
  const resultPath = resultFilePath(gitCwd, prNumber);
  const worktreePath = worktreePathFor(gitCwd, kind, prNumber);
  const logFile = resolverLogPath(prNumber, kind);
  const payload = JSON.stringify({
    kind,
    prNumber,
    pid: process.pid, // overwritten with child PID once spawned (see updateLockWithChildPid)
    parentPid: process.pid,
    startedAt: new Date().toISOString(),
    worktreePath,
    lockFile: lockPath,
    resultFile: resultPath,
    logFile,
    status: "spawning",
  });

  // Atomic create: O_EXCL fails if the lock already exists. Anything that snuck
  // in between listActiveResolvers() above and now will lose the race.
  let fd;
  try {
    fd = fs.openSync(lockPath, "wx");
  } catch (e) {
    if (e && e.code === "EEXIST") {
      // Another process took the lock in the same tick — defer.
      return {
        ok: false,
        action: "skipped_branch_locked",
        detail: `PR #${prNumber} lockfile created concurrently by another process`,
        active,
      };
    }
    throw e;
  }
  try {
    fs.writeSync(fd, payload);
  } finally {
    fs.closeSync(fd);
  }

  let released = false;
  /** Called by the parent if it fails to spawn the child. Removes the lock so the next tick can retry. */
  const release = () => {
    if (released) return;
    released = true;
    safeRemoveWorktree(gitCwd, worktreePath);
    safeRemoveLockFile(lockPath);
  };

  return {
    ok: true,
    kind,
    prNumber,
    worktreePath,
    lockFilePath: lockPath,
    resultFilePath: resultPath,
    logFile,
    release,
  };
}

/**
 * After spawning the runner child, the parent rewrites the lockfile so the recorded `pid`
 * tracks the child. Subsequent ticks check `isProcessAlive(lock.pid)` against the child.
 */
export function updateLockWithChildPid(lockFile, childPid) {
  try {
    const raw = fs.readFileSync(lockFile, "utf8");
    const lock = JSON.parse(raw);
    lock.pid = childPid;
    lock.status = "running";
    fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2));
  } catch (e) {
    // The runner can also rewrite this from its side; not fatal if the parent's update fails.
    console.error(`[lock] failed to update lock pid -> ${childPid}: ${(e && e.message) || e}`);
  }
}

/**
 * Consume a completed-resolver result file: read it, delete it, return its contents.
 * Returns `null` if no result file exists for that PR.
 */
export function consumeResultFile(gitCwd, prNumber) {
  const p = resultFilePath(gitCwd, prNumber);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    try {
      fs.unlinkSync(p);
    } catch {
      /* best effort */
    }
    return parsed;
  } catch (e) {
    // Corrupt file — discard so we don't loop forever.
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
    return { ok: false, action: "result_file_unreadable", detail: (e && e.message) || String(e) };
  }
}

function findRunnerScript() {
  // resolver-lock.mjs lives in the same dir as resolver-runner.mjs.
  const thisFile = fileURLToPath(import.meta.url);
  return path.join(path.dirname(thisFile), "resolver-runner.mjs");
}

/**
 * Spawn the resolver child detached and unref it so the parent (cli.mjs) can return immediately.
 * The child writes its result to `lock.resultFilePath` on exit and removes the lockfile.
 *
 * @param {ReturnType<typeof tryAcquireResolverLock>} lock - must be an `ok: true` lock
 * @param {{ owner: string, repo: string, gitCwd: string }} ctx
 * @returns {{ ok: true, pid: number, logFile: string } | { ok: false, action: string, detail: string }}
 */
export function spawnResolverChild(lock, ctx) {
  if (!lock || !lock.ok) {
    return { ok: false, action: "no_lock", detail: "spawnResolverChild called without a held lock" };
  }
  const { kind, prNumber, worktreePath, lockFilePath: lockFile, resultFilePath: resultFile, logFile } = lock;

  fs.mkdirSync(path.dirname(logFile), { recursive: true });

  let logFd;
  try {
    logFd = fs.openSync(logFile, "a");
  } catch (e) {
    return {
      ok: false,
      action: "log_open_failed",
      detail: `failed to open log file ${logFile}: ${(e && e.message) || e}`,
    };
  }

  const runnerScript = findRunnerScript();
  const args = [
    runnerScript,
    `--kind=${kind}`,
    `--owner=${ctx.owner}`,
    `--repo=${ctx.repo}`,
    `--git-cwd=${ctx.gitCwd}`,
    `--pr-number=${prNumber}`,
    `--worktree-path=${worktreePath}`,
    `--lock-file=${lockFile}`,
    `--result-file=${resultFile}`,
  ];

  /** @type {import('node:child_process').ChildProcess} */
  let child;
  try {
    child = spawn(process.execPath, args, {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      cwd: ctx.gitCwd,
      env: process.env,
    });
  } catch (e) {
    try {
      fs.closeSync(logFd);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      action: "spawn_failed",
      detail: (e && e.message) || String(e),
    };
  }

  // Parent's logFd duplicates onto the child; close ours so we don't keep the file open.
  try {
    fs.closeSync(logFd);
  } catch {
    /* ignore */
  }
  child.unref();

  updateLockWithChildPid(lockFile, child.pid);

  return { ok: true, pid: child.pid, logFile };
}

/** Best-effort: remove ALL stale resolver locks. Used on script startup. */
export function reapStaleResolvers(gitCwd) {
  // listActiveResolvers already cleans up stale ones as a side-effect.
  return listActiveResolvers(gitCwd);
}

/** True when `claude` (Claude Code CLI) is callable on the current PATH. */
export function hasClaudeCli() {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
