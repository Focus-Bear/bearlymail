import { Injectable, Logger } from "@nestjs/common";
import { Octokit } from "@octokit/rest";

import { getErrorMessage } from "../types/common";
import { GitHubChecksSummary, GitHubReviewerDetail } from "./github-api.types";

/**
 * GitHub review state strings as returned by the reviews endpoint.
 * Lifted to module-level constants to satisfy the no-restricted-syntax lint rule.
 */
const REVIEW_STATE_APPROVED = "APPROVED";
const REVIEW_STATE_CHANGES_REQUESTED = "CHANGES_REQUESTED";

/** Check-run `status` values returned by GitHub. */
const CHECK_STATUS_COMPLETED = "completed";

/** Check-run `conclusion` values that represent a non-passing terminal state. */
const FAILING_CHECK_CONCLUSIONS: ReadonlySet<string> = new Set([
  "failure",
  "cancelled",
  "timed_out",
  "action_required",
]);

const CHECK_CONCLUSION_SUCCESS = "success";

const CHECK_RUNS_PER_PAGE = 100;

/**
 * Safety cap on the number of check-run pages we'll fetch for a single PR.
 * 20 pages × 100 per page = 2,000 check runs, which is well beyond any
 * realistic CI matrix. Prevents an unbounded loop if GitHub's pagination
 * misbehaves.
 */
const MAX_CHECK_RUN_PAGES = 20;

/**
 * Enrichment helpers used by GitHubApiService to populate the secondary
 * signals on a PR card (reviewer counts, requested reviewers, CI checks).
 *
 * Lives in its own service to keep github-api.service.ts under the 800-line
 * cap; mirrors the pattern already used by GitHubProjectStatusService.
 */
@Injectable()
export class GitHubPrEnrichmentService {
  private readonly logger = new Logger(GitHubPrEnrichmentService.name);

  private createClient(token: string): Octokit {
    return new Octokit({ auth: token });
  }

  /**
   * Compute approval / change-requests counts and requested-reviewer logins.
   *
   * Applies "latest review per user wins" (so a later CHANGES_REQUESTED
   * supersedes an earlier APPROVED from the same reviewer) before counting.
   * Team review requests are prefixed with "@" so the rendered chip can
   * distinguish them from user logins.
   */
  buildReviewerDetail(
    reviews: Array<{
      state: string;
      user: { login: string };
      submitted_at?: string | null;
    }>,
    requestedReviewersResp: {
      users?: Array<{ login: string }>;
      teams?: Array<{ slug: string; name?: string }>;
    },
  ): GitHubReviewerDetail {
    // Track both the latest review state AND its timestamp per user.
    // (The legacy determineReviewStatus stored only state, which made the
    // recency check compare a date against new Date("APPROVED") = Invalid
    // Date — silently locking in whichever review GitHub returned first.)
    const latestReviews = new Map<string, { state: string; at: number }>();
    for (const review of reviews) {
      if (
        review.state !== REVIEW_STATE_APPROVED &&
        review.state !== REVIEW_STATE_CHANGES_REQUESTED
      ) {
        continue;
      }
      const at = review.submitted_at
        ? new Date(review.submitted_at).getTime()
        : 0;
      const existing = latestReviews.get(review.user.login);
      if (!existing || at > existing.at) {
        latestReviews.set(review.user.login, { state: review.state, at });
      }
    }

    let approvalCount = 0;
    let changesRequestedCount = 0;
    for (const entry of latestReviews.values()) {
      if (entry.state === REVIEW_STATE_APPROVED) {
        approvalCount++;
      } else if (entry.state === REVIEW_STATE_CHANGES_REQUESTED) {
        changesRequestedCount++;
      }
    }

    const userLogins = (requestedReviewersResp.users ?? []).map(
      (user) => user.login,
    );
    const teamLogins = (requestedReviewersResp.teams ?? []).map(
      (team) => `@${team.slug}`,
    );

    return {
      approvalCount,
      changesRequestedCount,
      requestedReviewers: [...userLogins, ...teamLogins],
    };
  }

  /**
   * Fetch GitHub check-runs for a commit SHA and roll up into a single
   * pass/fail/pending state with the names of any non-passing checks.
   *
   * Returns null on auth/permission errors so callers can degrade silently —
   * the inbox simply omits the CI chip when checks data is missing.
   */
  async fetchPRChecks(
    token: string,
    owner: string,
    repo: string,
    sha: string,
  ): Promise<GitHubChecksSummary | null> {
    try {
      const octokit = this.createClient(token);
      // Paginate through check runs. Large CI matrices can produce more than
      // one page of 100, and a failing run on page 2 would otherwise be
      // silently ignored, producing a misleading "passing" chip.
      const runs = await this.fetchAllCheckRuns(octokit, owner, repo, sha);

      if (runs.length === 0) {
        return { state: "none", total: 0, failingChecks: [] };
      }

      const failingChecks: string[] = [];
      let anyPending = false;
      let anyPassing = false;

      for (const run of runs) {
        if (run.status !== CHECK_STATUS_COMPLETED) {
          anyPending = true;
          continue;
        }
        if (run.conclusion && FAILING_CHECK_CONCLUSIONS.has(run.conclusion)) {
          failingChecks.push(run.name);
        } else if (run.conclusion === CHECK_CONCLUSION_SUCCESS) {
          anyPassing = true;
        }
      }

      let state: GitHubChecksSummary["state"];
      if (failingChecks.length > 0) {
        state = "failing";
      } else if (anyPending) {
        state = "pending";
      } else if (anyPassing) {
        state = "passing";
      } else {
        state = "none";
      }

      return { state, total: runs.length, failingChecks };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.debug(
        `Could not fetch check-runs for ${owner}/${repo}@${sha}: ${errorMessage}`,
      );
      return null;
    }
  }

  /**
   * Fetch every check run for a commit SHA, paginating until the API reports
   * we've seen them all (capped by MAX_CHECK_RUN_PAGES as a safety net).
   */
  private async fetchAllCheckRuns(
    octokit: Octokit,
    owner: string,
    repo: string,
    sha: string,
  ): Promise<
    Array<{
      status?: string | null;
      conclusion?: string | null;
      name: string;
    }>
  > {
    const runs: Array<{
      status?: string | null;
      conclusion?: string | null;
      name: string;
    }> = [];
    let totalCount = 0;
    for (let page = 1; page <= MAX_CHECK_RUN_PAGES; page++) {
      const response = await octokit.rest.checks.listForRef({
        owner,
        repo,
        ref: sha,
        per_page: CHECK_RUNS_PER_PAGE,
        page,
      });
      totalCount = response.data.total_count ?? totalCount;
      const pageRuns = response.data.check_runs ?? [];
      runs.push(...pageRuns);
      if (pageRuns.length < CHECK_RUNS_PER_PAGE || runs.length >= totalCount) {
        break;
      }
    }
    return runs;
  }
}
