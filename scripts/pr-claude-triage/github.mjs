import { execSync } from "node:child_process";
import process from "node:process";

import { API_VERSION } from "./constants.mjs";

export function parseNextLink(linkHeader) {
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
export function ensureGithubTokenFromGhCli() {
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

export function getToken() {
  const t = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!t) {
    throw new Error(
      "GitHub token missing: set GITHUB_TOKEN or GH_TOKEN, or run `gh auth login` so `gh auth token` works.",
    );
  }
  return t;
}

export async function githubRest(path) {
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

export async function githubRestPost(path, jsonBody) {
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

export async function githubRestPatch(path, jsonBody) {
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
export async function githubRestPostStatus(path, jsonBody) {
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
export async function githubRestDelete(path) {
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

export async function fetchAllPages(firstUrl) {
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

export async function graphql(query, variables) {
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

export async function listOpenPulls(owner, repo) {
  const base = `/repos/${owner}/${repo}/pulls?state=open&per_page=100&sort=updated&direction=desc`;
  return fetchAllPages(`https://api.github.com${base}`);
}

export async function fetchIssueComments(owner, repo, issueNumber) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100&sort=updated&direction=desc`;
  return fetchAllPages(url);
}

export async function listWorkflowRunsForHeadSha(owner, repo, headSha) {
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

export async function fetchCheckRunsForSha(owner, repo, sha) {
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
