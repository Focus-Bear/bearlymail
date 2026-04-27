import { MERGE_STATE_QUERY } from "./constants.mjs";
import { githubRest, graphql } from "./github.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string | null | undefined} state
 * @returns {boolean}
 */
export function isMergeableStateRestUnknown(state) {
  const s = String(state ?? "").toLowerCase();
  return !s || s === "unknown";
}

/**
 * @returns {Promise<{ mergeable: string, mergeStateStatus: string } | null>}
 */
export async function fetchPullRequestMergeStateGraphql(owner, repo, prNumber) {
  const data = await graphql(MERGE_STATE_QUERY, {
    owner,
    name: repo,
    number: prNumber,
  });
  const p = data?.repository?.pullRequest;
  if (!p) {
    return null;
  }
  const ms = p.mergeStateStatus != null ? String(p.mergeStateStatus) : "UNKNOWN";
  if (p.mergeable == null) {
    // mergeable can be null while mergeStateStatus is already DIRTY — do not drop the conflict.
    return { mergeable: "UNKNOWN", mergeStateStatus: ms };
  }
  return { mergeable: String(p.mergeable), mergeStateStatus: ms };
}

/**
 * Map GraphQL merge state onto REST-style fields. REST often leaves `mergeable: null` while the UI
 * already shows conflicts; GraphQL reports CONFLICTING / mergeStateStatus DIRTY reliably.
 * @param {Record<string, unknown>} pr
 * @param {{ mergeable: string, mergeStateStatus: string } | null} gql
 */
export function applyGraphqlMergeableToPr(pr, gql) {
  if (!gql) {
    return { ...pr, mergeability_indeterminate: true };
  }
  const m = (gql.mergeable || "UNKNOWN").toString().toUpperCase();
  const s = (gql.mergeStateStatus || "UNKNOWN").toString().toUpperCase();

  if (m === "CONFLICTING" || s === "DIRTY") {
    return {
      ...pr,
      mergeable: false,
      mergeable_state: "dirty",
      mergeStateStatus: gql.mergeStateStatus ?? null,
      mergeability_indeterminate: false,
    };
  }

  if (m === "MERGEABLE") {
    return {
      ...pr,
      mergeable: true,
      mergeable_state: s === "UNKNOWN" ? "unknown" : s.toLowerCase(),
      mergeStateStatus: gql.mergeStateStatus ?? null,
      mergeability_indeterminate: false,
    };
  }

  if (m === "UNKNOWN" && s === "DIRTY") {
    return {
      ...pr,
      mergeable: false,
      mergeable_state: "dirty",
      mergeStateStatus: gql.mergeStateStatus ?? null,
      mergeability_indeterminate: false,
    };
  }

  return {
    ...pr,
    mergeStateStatus: gql.mergeStateStatus ?? null,
    mergeability_indeterminate: true,
  };
}

/**
 * GraphQL merge fields say there are merge conflicts (stale REST may still show mergeable: true).
 * @param {{ mergeable: string, mergeStateStatus: string } | null} gql
 * @returns {boolean}
 */
export function isGraphqlMergeStateConflicting(gql) {
  if (!gql) return false;
  const m = (gql.mergeable || "").toString().toUpperCase();
  const s = (gql.mergeStateStatus || "").toString().toUpperCase();
  return m === "CONFLICTING" || s === "DIRTY" || (m === "UNKNOWN" && s === "DIRTY");
}

/**
 * Refresh mergeability from GET /pulls/{number} (never trust list PR merge fields — they are often stale).
 * GitHub may return mergeable: null while mergeability is still computing; poll until it becomes a boolean
 * or we hit a cap. If `mergeable` is still null (or mergeable_state is unknown), use GraphQL — REST can stay
 * UNKNOWN while the PR page already shows conflicts, which would otherwise yield a false "no conflict".
 */
export async function refreshPullMergeStatus(owner, repo, pr) {
  const maxAttempts = 12;
  const delayMs = 1000;

  let current = { ...pr };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const fresh = await githubRest(`/repos/${owner}/${repo}/pulls/${pr.number}`);
      current = { ...current, ...fresh };
    } catch {
      return current;
    }

    /* `mergeable` can stay null while `mergeable_state` is already `dirty` (conflicts). Do not spin 12×. */
    if (String(current.mergeable_state ?? "").toLowerCase() === "dirty") {
      return current;
    }
    if (current.mergeable === false) {
      break;
    }
    if (current.mergeable === true) {
      // REST can report true while conflicts exist; always reconcile with GraphQL after the loop.
      break;
    }

    if (attempt < maxAttempts - 1) {
      await sleep(delayMs);
    }
  }

  const restIndeterminate =
    current.mergeable == null || isMergeableStateRestUnknown(current.mergeable_state);

  try {
    const gqlState = await fetchPullRequestMergeStateGraphql(owner, repo, pr.number);
    if (gqlState) {
      if (isGraphqlMergeStateConflicting(gqlState)) {
        current = applyGraphqlMergeableToPr(current, gqlState);
      } else if (restIndeterminate) {
        current = applyGraphqlMergeableToPr(current, gqlState);
      }
    }
  } catch (e) {
    console.warn(
      `[warn] GraphQL merge state for PR #${pr.number} failed: ${(e && e.message) || e}`,
    );
    if (current.mergeable == null && isMergeableStateRestUnknown(current.mergeable_state)) {
      current = { ...current, mergeability_indeterminate: true };
    }
  }

  return current;
}

/**
 * Conflicts: REST `mergeable_state` `dirty`, GraphQL `mergeStateStatus` `DIRTY`,
 * or mergeable false / CONFLICTING once GitHub has finished computing.
 * @param {Record<string, unknown>} pr
 */
export function hasMergeConflict(pr) {
  const state = String(pr.mergeable_state ?? "").toLowerCase();
  if (state === "dirty") {
    return true;
  }
  if (pr.mergeable === false) {
    return true;
  }
  const g = String(pr.mergeStateStatus ?? "").toUpperCase();
  if (g === "DIRTY") {
    return true;
  }
  return false;
}

/**
 * GitHub merge is not "clean" (required status checks, reviews, branch rules, or failing check hooks).
 * `blocked` and `unstable` are common when the PR cannot be merged from the button yet.
 */
export function mergeableStateIsBlockingGates(mergeableState) {
  const s = String(mergeableState ?? "").toLowerCase();
  return s === "blocked" || s === "unstable";
}
