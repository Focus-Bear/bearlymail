import process from "node:process";

import { API_VERSION, ORPHAN_PR_MAX_AGE_MS } from "./constants.mjs";
import {
  getToken,
  githubRest,
  githubRestDelete,
  githubRestPostStatus,
  parseNextLink,
} from "./github.mjs";

export function issueNumberFromClaudeBranchName(branchName) {
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
 * Remove `refs/heads/{branchName}` (same ref encoding as empty-commit retrigger).
 * @returns {Promise<{ ok: boolean, status: number, text: string }>}
 */
async function deleteRemoteBranchRef(owner, repo, branchName) {
  const refPath = `heads/${branchName}`;
  const refEnc = encodeURIComponent(refPath);
  return githubRestDelete(`/repos/${owner}/${repo}/git/refs/${refEnc}`);
}

export async function fetchRepositoryDefaultBranch(owner, repo) {
  const envBase = process.env.PR_TRIAGE_BASE_BRANCH?.trim();
  if (envBase) return envBase;
  const data = await githubRest(`/repos/${owner}/${repo}`);
  return data.default_branch || "main";
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
export async function createPullRequestsForOrphanBranches(owner, repo, orphans, baseBranch, options) {
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
 * Remote refs under refs/heads/claude (Claude Code branches). 404 → no matching branches.
 */
export async function listClaudeGitRefs(owner, repo) {
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
export function findOrphanClaudeBranches(gitRefs, openHeadRefs) {
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
