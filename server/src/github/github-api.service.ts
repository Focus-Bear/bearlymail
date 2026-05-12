import { Injectable, Logger } from "@nestjs/common";
import { Octokit } from "@octokit/rest";

import { GITHUB_LINK_TYPES } from "../constants/domain-types";
import { GITHUB_FIELD_NAMES } from "../constants/domain-types";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { HTTP_STATUS } from "../constants/http-status";
import { getErrorMessage, isApiError } from "../types/common";
import { ParsedGitHubLink } from "./github.service";
import {
  GitHubIssueStatus,
  GitHubPRStatus,
  GraphQLErrorWithData,
  ProjectItemsGraphQLResponse,
  ProjectStatusOptionsGraphQLResponse,
  SearchResultItem,
} from "./github-api.types";
import { GitHubPrEnrichmentService } from "./github-pr-enrichment.service";

export type {
  GitHubChecksSummary,
  GitHubIssueStatus,
  GitHubPRStatus,
  GitHubReviewerDetail,
} from "./github-api.types";

/**
 * Overall review-status values exposed on a PR card. Lifted to module-level
 * constants so the derivation in fetchPRStatus uses named values instead of
 * raw string literals (and keeps the union type below in sync with them).
 */
const REVIEW_STATUS_APPROVED = "approved";
const REVIEW_STATUS_CHANGES_REQUESTED = "changes_requested";
const REVIEW_STATUS_PENDING = "pending";
type PrReviewStatus =
  | typeof REVIEW_STATUS_APPROVED
  | typeof REVIEW_STATUS_CHANGES_REQUESTED
  | typeof REVIEW_STATUS_PENDING
  | null;

@Injectable()
export class GitHubApiService {
  private readonly logger = new Logger(GitHubApiService.name);

  constructor(
    private readonly prEnrichmentService: GitHubPrEnrichmentService,
  ) {}

  /**
   * Create an authenticated Octokit client
   */
  private createClient(token: string): Octokit {
    return new Octokit({
      auth: token,
    });
  }

  /**
   * Test if a GitHub token is valid and return the authenticated user info
   */
  async testToken(token: string): Promise<{
    valid: boolean;
    login?: string;
    name?: string;
    scopes?: string[];
    error?: string;
  }> {
    try {
      const octokit = this.createClient(token);
      const response = await octokit.request("GET /user", {
        headers: { "X-OAuth-Scopes": "" },
      });
      // Extract scopes from response headers if available
      const scopesHeader =
        (response.headers as unknown as Record<string, string | undefined>)?.[
          "x-oauth-scopes"
        ] ?? "";
      const scopes = scopesHeader
        ? scopesHeader
            .split(",")
            .map((segment: string) => segment.trim())
            .filter(Boolean)
        : [];
      return {
        valid: true,
        login: response.data.login,
        name: (response.data.name as string | null) ?? undefined,
        scopes,
      };
    } catch (error: unknown) {
      return { valid: false, error: getErrorMessage(error) };
    }
  }

  /**
   * Test if a token can access a specific repository
   */
  async testRepoAccess(
    token: string,
    owner: string,
    repo: string,
  ): Promise<{ accessible: boolean; isPrivate?: boolean; error?: string }> {
    try {
      const octokit = this.createClient(token);
      const result = await this.checkRepositoryAccess(octokit, owner, repo);
      return result;
    } catch (error: unknown) {
      return { accessible: false, error: getErrorMessage(error) };
    }
  }

  /**
   * Check if we can access a repository (helps distinguish 404 between "doesn't exist" and "no access")
   */
  private async checkRepositoryAccess(
    octokit: Octokit,
    owner: string,
    repo: string,
  ): Promise<{ accessible: boolean; isPrivate?: boolean }> {
    try {
      const response = await octokit.rest.repos.get({
        owner,
        repo,
      });
      return {
        accessible: true,
        isPrivate: response.data.private,
      };
    } catch (error: unknown) {
      if (isApiError(error) && error.code === HTTP_STATUS.NOT_FOUND) {
        // Could be "doesn't exist" or "no access" - we can't distinguish
        return { accessible: false };
      }
      // Other errors (401, 403) indicate permission issues
      return { accessible: false };
    }
  }

  /**
   * GraphQL query string for fetching project items attached to an issue/PR
   */
  private readonly projectItemsQuery = `
    query($owner: String!, $repo: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issueNumber) {
          projectItems(first: 100) {
            nodes {
              project {
                ... on ProjectV2 {
                  title
                }
              }
              fieldValues(first: 10) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                      }
                    }
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  /**
   * Execute the GraphQL query for project items, recovering partial data from errors
   * when GitHub returns both errors and data simultaneously.
   */
  private async executeProjectItemsQuery(
    octokit: Octokit,
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<ProjectItemsGraphQLResponse | undefined> {
    try {
      return await octokit.graphql<ProjectItemsGraphQLResponse>(
        this.projectItemsQuery,
        { owner, repo, issueNumber },
      );
    } catch (error: unknown) {
      const graphqlError = error as GraphQLErrorWithData;
      if (graphqlError?.responseData) {
        return graphqlError.responseData;
      }
      if (graphqlError?.graphqlResponseData) {
        return graphqlError.graphqlResponseData;
      }
      if (graphqlError?.response?.graphqlResponseData) {
        return graphqlError.response.graphqlResponseData;
      }
      return undefined;
    }
  }

  /**
   * Find the "Status" field value from a project item's field values.
   */
  private extractStatusFromFieldValues(
    fieldValueNodes:
      | Array<{
          field?: { name?: string };
          name?: string;
        } | null>
      | undefined,
  ): string | undefined {
    if (!fieldValueNodes) return undefined;
    for (const fieldValue of fieldValueNodes) {
      if (!fieldValue) continue;
      const fieldName = fieldValue.field?.name?.toLowerCase();
      if (fieldName === GITHUB_FIELD_NAMES.STATUS) {
        return fieldValue.name;
      }
    }
    return undefined;
  }

  /**
   * Convert raw project item nodes into the simplified project list format.
   */
  private extractProjectsFromNodes(
    nodes: Array<{
      project?: { title?: string };
      fieldValues?: {
        nodes?: Array<{
          field?: { name?: string };
          name?: string;
        } | null>;
      };
    } | null>,
    owner: string,
    repo: string,
    issueNumber: number,
  ): Array<{ name: string; status?: string }> {
    const nullItemCount = nodes.filter((item) => item === null).length;
    if (nullItemCount > 0 && nodes.length === nullItemCount) {
      this.logger.warn(
        `GitHub token may need 'Projects' permission - project items returned as null for ${owner}/${repo}#${issueNumber}`,
      );
    }

    const projects: Array<{ name: string; status?: string }> = [];
    for (const item of nodes) {
      if (!item) continue;
      const projectName = item?.project?.title;
      const status = this.extractStatusFromFieldValues(item.fieldValues?.nodes);
      if (projectName || status) {
        projects.push({
          name: projectName || "Unknown Project",
          ...(status && { status }),
        });
      }
    }
    return projects;
  }

  /**
   * Fetch projects that an issue/PR is part of using GraphQL API
   */
  private async fetchIssueProjects(
    token: string,
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<Array<{ name: string; status?: string }>> {
    try {
      const octokit = this.createClient(token);
      const response = await this.executeProjectItemsQuery(
        octokit,
        owner,
        repo,
        issueNumber,
      );

      if (!response?.repository?.issue?.projectItems?.nodes) {
        return [];
      }

      return this.extractProjectsFromNodes(
        response.repository.issue.projectItems.nodes,
        owner,
        repo,
        issueNumber,
      );
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const apiError = isApiError(error) ? error : null;
      const errorStatus = apiError?.status || apiError?.code;

      this.logger.warn(
        `Failed to fetch projects for ${owner}/${repo}#${issueNumber}`,
        {
          message: errorMessage,
          status: errorStatus,
          responseData: apiError?.response?.data,
        },
      );
      return [];
    }
  }

  /**
   * Fetch issue details from GitHub API
   */
  async fetchIssueStatus(
    token: string,
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GitHubIssueStatus | null> {
    try {
      const octokit = this.createClient(token);

      const response = await octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });

      const issue = response.data;

      // Fetch project information using GraphQL
      const projects = await this.fetchIssueProjects(
        token,
        owner,
        repo,
        issueNumber,
      );

      return {
        state: issue.state as "open" | "closed",
        title: issue.title,
        labels: issue.labels.map(
          (label: { name?: string; color?: string } | string) => ({
            name: typeof label === "string" ? label : label.name,
            color:
              typeof label === "string" ? "000000" : label.color || "000000",
          }),
        ),
        assignees: issue.assignees.map((assignee) => ({
          login: assignee.login,
          avatar_url: assignee.avatar_url,
        })),
        author: issue.user
          ? {
              login: issue.user.login,
              type: issue.user.type as "User" | "Bot" | "Organization",
            }
          : undefined,
        projects: projects.length > 0 ? projects : undefined,
      };
    } catch (error: unknown) {
      const apiUrl = `GET /repos/${owner}/${repo}/issues/${issueNumber}`;
      const fullUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;

      const errorMessage = getErrorMessage(error);
      const apiError = isApiError(error) ? error : null;
      const errorStatus = apiError?.status || apiError?.code;
      const errorResponse = apiError?.response;

      this.logger.error(
        `Failed to fetch issue ${owner}/${repo}#${issueNumber}`,
        {
          message: errorMessage,
          status: errorStatus,
          url: fullUrl,
          apiEndpoint: apiUrl,
          owner,
          repo,
          issueNumber,
          // Log response details if available
          responseData: errorResponse?.data,
          // Check if it's a permissions issue
          isPermissionError:
            errorStatus === HTTP_STATUS.UNAUTHORIZED ||
            errorStatus === HTTP_STATUS.FORBIDDEN,
          isNotFound: errorStatus === HTTP_STATUS.NOT_FOUND,
        },
      );

      if (
        errorStatus === HTTP_STATUS.UNAUTHORIZED ||
        errorStatus === HTTP_STATUS.FORBIDDEN
      ) {
        throw new Error(ERROR_MESSAGES.GITHUB_TOKEN_INVALID);
      }

      // Log additional context for 404 errors
      if (errorStatus === HTTP_STATUS.NOT_FOUND) {
        // Try to check if we can access the repository at all
        try {
          const repoAccess = await this.checkRepositoryAccess(
            this.createClient(token),
            owner,
            repo,
          );

          if (!repoAccess.accessible) {
            this.logger.warn(
              `Issue ${owner}/${repo}#${issueNumber} returned 404. Repository ${owner}/${repo} is not accessible with the current token. This likely means the repository is private and the token lacks access, or the repository doesn't exist.`,
            );
          } else {
            this.logger.warn(
              `Issue ${owner}/${repo}#${issueNumber} not found, but repository ${owner}/${repo} is accessible. The issue may not exist or may have been deleted.`,
            );
          }
        } catch (repoCheckError: unknown) {
          this.logger.warn(
            `Issue ${owner}/${repo}#${issueNumber} not found. Could not verify repository access: ${getErrorMessage(repoCheckError)}. Possible reasons: Issue doesn't exist, repository is private and token lacks access, or repository/issue was deleted.`,
          );
        }
      }

      return null;
    }
  }

  /**
   * Fetch PR details, reviews, comments and requested reviewers in parallel, defaulting
   * sub-fetches to empty arrays on error so a single failing call does not abort the whole
   * fetch (a 403 on requested-reviewers must not lose us the PR data, etc.).
   */
  private async fetchPRApiData(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
  ) {
    const [prResponse, reviews, comments, requestedReviewersResp] =
      await Promise.all([
        octokit.rest.pulls.get({ owner, repo, pull_number: prNumber }),
        octokit.rest.pulls
          .listReviews({ owner, repo, pull_number: prNumber })
          .then((resp) => resp.data)
          .catch(() => [] as never[]),
        octokit.rest.issues
          .listComments({ owner, repo, issue_number: prNumber })
          .then((resp) => resp.data)
          .catch(() => [] as never[]),
        octokit.rest.pulls
          .listRequestedReviewers({ owner, repo, pull_number: prNumber })
          .then((resp) => resp.data)
          .catch(() => ({ users: [], teams: [] }) as never),
      ]);
    return {
      pr: prResponse.data,
      reviews,
      comments,
      requestedReviewersResp,
    };
  }

  /**
   * Roll up reviewerDetail counts into a single summary review status.
   *
   * Rules: changes_requested beats approved (one CHANGES_REQUESTED is enough
   * to block a PR); pending if there are reviews but none currently counted;
   * null if there are no reviews at all.
   */
  private deriveReviewStatus(
    reviewerDetail: { approvalCount: number; changesRequestedCount: number },
    reviewsCount: number,
  ): PrReviewStatus {
    if (reviewerDetail.changesRequestedCount > 0) {
      return REVIEW_STATUS_CHANGES_REQUESTED;
    }
    if (reviewerDetail.approvalCount > 0) {
      return REVIEW_STATUS_APPROVED;
    }
    if (reviewsCount > 0) {
      return REVIEW_STATUS_PENDING;
    }
    return null;
  }

  /**
   * Handle a 404 response when fetching a PR: log context about whether the repo itself
   * is accessible to help diagnose permission vs. non-existence issues.
   */
  private async logPR404Context(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<void> {
    try {
      const repoAccess = await this.checkRepositoryAccess(
        this.createClient(token),
        owner,
        repo,
      );
      if (!repoAccess.accessible) {
        this.logger.warn(
          `PR ${owner}/${repo}#${prNumber} returned 404. Repository ${owner}/${repo} is not accessible with the current token. This likely means the repository is private and the token lacks access, or the repository doesn't exist.`,
        );
      } else {
        this.logger.warn(
          `PR ${owner}/${repo}#${prNumber} not found, but repository ${owner}/${repo} is accessible. The PR may not exist or may have been deleted.`,
        );
      }
    } catch (repoCheckError: unknown) {
      this.logger.warn(
        `PR ${owner}/${repo}#${prNumber} not found. Could not verify repository access: ${getErrorMessage(repoCheckError)}. Possible reasons: PR doesn't exist, repository is private and token lacks access, or repository/PR was deleted.`,
      );
    }
  }

  /**
   * Fetch pull request details from GitHub API
   */
  async fetchPRStatus(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<GitHubPRStatus | null> {
    try {
      const octokit = this.createClient(token);
      const { pr, reviews, comments, requestedReviewersResp } =
        await this.fetchPRApiData(octokit, owner, repo, prNumber);

      // Derive the summary reviewStatus from reviewerDetail's counts so it
      // stays consistent with the per-reviewer numbers shown in the UI.
      // (The earlier determineReviewStatus had a bug where it compared a Date
      // against new Date("APPROVED") = Invalid Date, locking in the first
      // review per user instead of the latest one.)
      const reviewerDetail = this.prEnrichmentService.buildReviewerDetail(
        reviews,
        requestedReviewersResp,
      );
      const reviewStatus = this.deriveReviewStatus(
        reviewerDetail,
        reviews.length,
      );

      // Fetch projects + checks in parallel. Both can degrade independently:
      // projects to [], checks to null. Don't block one on the other.
      const headSha = pr.head?.sha;
      const [projects, checks] = await Promise.all([
        this.fetchIssueProjects(token, owner, repo, prNumber),
        headSha
          ? this.prEnrichmentService.fetchPRChecks(token, owner, repo, headSha)
          : Promise.resolve(null),
      ]);

      return {
        state: pr.merged ? "merged" : (pr.state as "open" | "closed"),
        title: pr.title,
        labels: pr.labels.map(
          (label: { name?: string; color?: string } | string) => ({
            name: typeof label === "string" ? label : label.name,
            color:
              typeof label === "string" ? "000000" : label.color || "000000",
          }),
        ),
        assignees: pr.assignees.map((assignee) => ({
          login: assignee.login,
          avatar_url: assignee.avatar_url,
        })),
        author: pr.user
          ? {
              login: pr.user.login,
              type: pr.user.type as "User" | "Bot" | "Organization",
            }
          : undefined,
        reviewStatus,
        reviewerDetail,
        checks: checks ?? undefined,
        commentsCount: comments.length,
        mergeable: pr.mergeable,
        merged: pr.merged || false,
        projects: projects.length > 0 ? projects : undefined,
      };
    } catch (error: unknown) {
      const apiUrl = `GET /repos/${owner}/${repo}/pulls/${prNumber}`;
      const fullUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;

      const errorMessage = getErrorMessage(error);
      const apiError = isApiError(error) ? error : null;
      const errorStatus = apiError?.status || apiError?.code;
      const errorResponse = apiError?.response;

      this.logger.error(`Failed to fetch PR ${owner}/${repo}#${prNumber}`, {
        message: errorMessage,
        status: errorStatus,
        statusText: errorResponse?.statusText,
        url: fullUrl,
        apiEndpoint: apiUrl,
        owner,
        repo,
        prNumber,
        responseData: errorResponse?.data,
        isPermissionError:
          errorStatus === HTTP_STATUS.UNAUTHORIZED ||
          errorStatus === HTTP_STATUS.FORBIDDEN,
        isNotFound: errorStatus === HTTP_STATUS.NOT_FOUND,
      });

      if (
        errorStatus === HTTP_STATUS.UNAUTHORIZED ||
        errorStatus === HTTP_STATUS.FORBIDDEN
      ) {
        throw new Error(ERROR_MESSAGES.GITHUB_TOKEN_INVALID);
      }

      if (errorStatus === HTTP_STATUS.NOT_FOUND) {
        await this.logPR404Context(token, owner, repo, prNumber);
      }

      return null;
    }
  }

  /**
   * Fetch status for multiple GitHub links
   */
  async fetchMultipleStatuses(
    token: string,
    links: ParsedGitHubLink[],
  ): Promise<Map<string, GitHubIssueStatus | GitHubPRStatus>> {
    const results = new Map<string, GitHubIssueStatus | GitHubPRStatus>();

    // Fetch all in parallel with rate limiting consideration
    const promises = links.map(async (link) => {
      try {
        let status: GitHubIssueStatus | GitHubPRStatus | null = null;

        if (link.type === GITHUB_LINK_TYPES.ISSUE) {
          status = await this.fetchIssueStatus(
            token,
            link.owner,
            link.repo,
            link.number,
          );
        } else {
          status = await this.fetchPRStatus(
            token,
            link.owner,
            link.repo,
            link.number,
          );
        }

        if (status) {
          results.set(link.url, status);
        }
      } catch (error: unknown) {
        this.logger.error(
          `Error fetching status for ${link.url}: ${getErrorMessage(error)}`,
        );
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Create a new GitHub issue
   */
  async createIssue(
    token: string,
    params: {
      owner: string;
      repo: string;
      title: string;
      body: string;
      labels?: string[];
    },
  ): Promise<unknown> {
    const { owner, repo, title, body, labels } = params;
    try {
      const octokit = this.createClient(token);
      const response = await octokit.rest.issues.create({
        owner,
        repo,
        title,
        body,
        labels,
      });
      return response.data;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const apiError = isApiError(error) ? error : null;
      const errorStatus = apiError?.status || apiError?.code;

      this.logger.error(`Failed to create issue in ${owner}/${repo}`, {
        message: errorMessage,
        status: errorStatus,
      });
      if (
        errorStatus === HTTP_STATUS.UNAUTHORIZED ||
        errorStatus === HTTP_STATUS.FORBIDDEN
      ) {
        throw new Error(ERROR_MESSAGES.GITHUB_TOKEN_INVALID);
      }
      throw error;
    }
  }

  /**
   * Update issue status (open/closed)
   */
  async updateIssueStatus(
    token: string,
    owner: string,
    repo: string,
    issueNumber: number,
    state: "open" | "closed",
  ): Promise<unknown> {
    try {
      const octokit = this.createClient(token);
      const response = await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        state,
      });
      return response.data;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const apiError = isApiError(error) ? error : null;
      const errorStatus = apiError?.status || apiError?.code;

      this.logger.error(
        `Failed to update issue ${owner}/${repo}#${issueNumber}`,
        {
          message: errorMessage,
          status: errorStatus,
        },
      );
      if (
        errorStatus === HTTP_STATUS.UNAUTHORIZED ||
        errorStatus === HTTP_STATUS.FORBIDDEN
      ) {
        throw new Error(ERROR_MESSAGES.GITHUB_TOKEN_INVALID);
      }
      throw error;
    }
  }

  /**
   * Add a comment to an issue
   */
  async addIssueComment(
    token: string,
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<unknown> {
    try {
      const octokit = this.createClient(token);
      const response = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });
      return response.data;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const apiError = isApiError(error) ? error : null;
      const errorStatus = apiError?.status || apiError?.code;

      this.logger.error(
        `Failed to add comment to ${owner}/${repo}#${issueNumber}`,
        {
          message: errorMessage,
          status: errorStatus,
        },
      );
      if (
        errorStatus === HTTP_STATUS.UNAUTHORIZED ||
        errorStatus === HTTP_STATUS.FORBIDDEN
      ) {
        throw new Error(ERROR_MESSAGES.GITHUB_TOKEN_INVALID);
      }
      throw error;
    }
  }

  /**
   * Search for issues using GitHub search API
   */
  async searchIssues(
    token: string,
    query: string,
  ): Promise<
    Array<{ number: number; title: string; state: string; url: string }>
  > {
    try {
      const octokit = this.createClient(token);
      const response = await octokit.rest.search.issuesAndPullRequests({
        q: query,
      });
      return response.data.items.map((item: SearchResultItem) => ({
        number: item.number,
        title: item.title,
        state: item.state,
        url: item.html_url,
        repository: item.repository_url.replace(
          "https://api.github.com/repos/",
          "",
        ),
        body: item.body,
        labels: item.labels.map((label) => ({
          name: label.name,
          color: label.color,
        })),
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }));
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const apiError = isApiError(error) ? error : null;
      const errorStatus = apiError?.status || apiError?.code;

      this.logger.error(`Failed to search issues with query: ${query}`, {
        message: errorMessage,
        status: errorStatus,
      });
      if (
        errorStatus === HTTP_STATUS.UNAUTHORIZED ||
        errorStatus === HTTP_STATUS.FORBIDDEN
      ) {
        throw new Error(ERROR_MESSAGES.GITHUB_TOKEN_INVALID);
      }
      throw error;
    }
  }

  /**
   * GraphQL query to fetch the Status field options from the project(s) an issue belongs to.
   * Returns the single-select options for the "Status" field in GitHub Projects v2.
   */
  private readonly projectStatusOptionsQuery = `
    query($owner: String!, $repo: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issueNumber) {
          projectItems(first: 100) {
            nodes {
              project {
                ... on ProjectV2 {
                  title
                  fields(first: 100) {
                    nodes {
                      ... on ProjectV2SingleSelectField {
                        name
                        options {
                          id
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  /**
   * Fetch the available Status field options from GitHub Projects v2 for a given issue.
   * Returns an array of { id, name } objects representing the project column/status options.
   */
  async fetchProjectStatusOptions(
    token: string,
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<Array<{ id: string; name: string }>> {
    try {
      const octokit = this.createClient(token);
      const response =
        await octokit.graphql<ProjectStatusOptionsGraphQLResponse>(
          this.projectStatusOptionsQuery,
          { owner, repo, issueNumber },
        );

      const projectNodes =
        response?.repository?.issue?.projectItems?.nodes ?? [];

      for (const item of projectNodes) {
        if (!item?.project?.fields?.nodes) continue;
        for (const field of item.project.fields.nodes) {
          if (!field) continue;
          const fieldName = field.name?.toLowerCase();
          if (
            fieldName === GITHUB_FIELD_NAMES.STATUS &&
            field.options?.length
          ) {
            return field.options.map((opt) => ({ id: opt.id, name: opt.name }));
          }
        }
      }

      return [];
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.warn(
        `Failed to fetch project status options for ${owner}/${repo}#${issueNumber}: ${errorMessage}`,
      );
      return [];
    }
  }
}
