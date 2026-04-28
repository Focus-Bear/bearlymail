import { execFileSync } from "node:child_process";
import process from "node:process";

/**
 * @param {string} gitCwd
 * @param {string[]} args
 */
export function gitInRepo(gitCwd, args) {
  return execFileSync("git", args, { cwd: gitCwd, encoding: "utf8" }).trim();
}

/**
 * @param {string} gitCwd
 */
export function isInsideGitWorkTree(gitCwd) {
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
export function originRemoteMatchesRepository(gitCwd, owner, repo) {
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
export function shouldUseLocalGitForRetrigger() {
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
export async function pushEmptyCommitForCiRetriggerWithLocalGit(gitCwd, branchName, message) {
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
