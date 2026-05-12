/**
 * Shared types for GitHubApiService.
 * Extracted to keep github-api.service.ts under the 800-line limit.
 */

export interface ProjectItemsGraphQLResponse {
  repository?: {
    issue?: {
      projectItems?: {
        nodes?: Array<{
          project?: { title?: string };
          fieldValues?: {
            nodes?: Array<{
              field?: { name?: string };
              name?: string;
            } | null>;
          };
        } | null>;
      };
    };
  };
}

export interface GraphQLErrorWithData {
  responseData?: ProjectItemsGraphQLResponse;
  graphqlResponseData?: ProjectItemsGraphQLResponse;
  response?: { graphqlResponseData?: ProjectItemsGraphQLResponse };
}

export interface SearchResultItem {
  number: number;
  title: string;
  state: string;
  html_url: string;
  repository_url: string;
  body?: string | null;
  labels: Array<{ name?: string; color?: string }>;
  created_at: string;
  updated_at: string;
}

export interface GitHubAuthor {
  login: string;
  type: "User" | "Bot" | "Organization";
}

export interface GitHubReviewerDetail {
  approvalCount: number;
  changesRequestedCount: number;
  /** Reviewers who were requested but have not yet submitted a review. */
  requestedReviewers: string[];
}

/**
 * Aggregate CI signal for a PR, derived from the GitHub check-runs API.
 *
 * `state` semantics:
 *  - `passing` — at least one check run completed successfully and none failed
 *  - `failing` — at least one check run concluded with failure / cancelled /
 *                timed_out / action_required
 *  - `pending` — at least one check run is still queued or in_progress (and
 *                no failure has been observed yet)
 *  - `none`    — no check runs reported for the head commit
 */
export interface GitHubChecksSummary {
  state: "passing" | "failing" | "pending" | "none";
  total: number;
  /** Names of the check runs in a non-passing terminal state. */
  failingChecks: string[];
}

export interface GitHubIssueStatus {
  state: "open" | "closed";
  title: string;
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string; avatar_url: string }>;
  author?: GitHubAuthor;
  projects?: Array<{
    name: string;
    status?: string;
  }>;
}

export interface GitHubPRStatus {
  state: "open" | "closed" | "merged";
  title: string;
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string; avatar_url: string }>;
  author?: GitHubAuthor;
  reviewStatus: "approved" | "changes_requested" | "pending" | null;
  reviewerDetail?: GitHubReviewerDetail;
  checks?: GitHubChecksSummary;
  commentsCount: number;
  mergeable: boolean | null;
  merged: boolean;
  projects?: Array<{
    name: string;
    status?: string;
  }>;
}

export interface ProjectStatusOptionsGraphQLResponse {
  repository?: {
    issue?: {
      projectItems?: {
        nodes?: Array<{
          project?: {
            title?: string;
            fields?: {
              nodes?: Array<{
                name?: string;
                options?: Array<{
                  id: string;
                  name: string;
                }>;
              } | null>;
            };
          };
        } | null>;
      };
    };
  };
}
