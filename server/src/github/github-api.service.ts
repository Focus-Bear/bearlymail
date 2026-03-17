import { Injectable, Logger } from "@nestjs/common";
import { Octokit } from "@octokit/rest";

import { HTTP_STATUS } from "../constants/http-status";
import { getErrorMessage, isApiError } from "../types/common";
import { ParsedGitHubLink } from "./github.service";

/**
 * GraphQL response for fetching project status field options via Projects v2
 */
interface ProjectStatusOptionsGraphQLResponse {
  repository?: {
    issue?: {
      projectItems?: {
        nodes?: Array<{
          id?: string;
          project?: {
            id?: string;
            title?: string;
            fields?: {
              nodes?: Array<{
                id?: string;
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

/** Node IDs + options returned by fetchProjectStatusOptions for the Projects v2 mutation. */
export interface ProjectStatusData {
  projectId: string;
  itemId: string;
  fieldId: string;
  options: Array<{ id: string; name: string }>;
}

/**
 * GraphQL response for project items query
 * This is a complex nested structure from GitHub's GraphQL API
 */
interface ProjectItemsGraphQLResponse {
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

/**
 * GraphQL error with optional response data
 * GitHub's GraphQL can return partial data even with errors
 */
interface GraphQLErrorWithData {
  responseData?: ProjectItemsGraphQLResponse;
  graphqlResponseData?: ProjectItemsGraphQLResponse;
  response?: { graphqlResponseData?: ProjectItemsGraphQLResponse };
}

/**
 * Search result item from Octokit REST API
 */
interface SearchResultItem {
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

export interface GitHubIssueStatus {
  state: "open" | "closed";
  title: string;
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string; avatar_url: string }>;
  projects?: Array<{
    name: string;
    // Status field value (e.g., "In Progress", "Backlog")
    status?: string;
  }>;
}

export interface GitHubPRStatus {
  state: "open" | "closed" | "merged";
  title: string;
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string; avatar_url: string }>;
  reviewStatus: "approved" | "changes_requested" | "pending" | null;
  commentsCount: number;
  mergeable: boolean | null;
  merged: boolean;
  projects?: Array<{
    name: string;
    // Status field value (e.g., "In Progress", "Backlog")
    status?: string;
  }>;
}

@Injectable()
export class GitHubApiService {
  private readonly logger = new Logger(GitHubApiService.name);

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
          projectItems(first: 20) {
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
      if (fieldName === "status") {
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
        throw new Error("GitHub token is invalid or expired");
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
   * Fetch PR details, reviews and comments in parallel, defaulting reviews/comments to
   * empty arrays on error so a single failing sub-request does not abort the whole fetch.
   */
  private async fetchPRApiData(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
  ) {
    const [prResponse, reviews, comments] = await Promise.all([
      octokit.rest.pulls.get({ owner, repo, pull_number: prNumber }),
      octokit.rest.pulls
        .listReviews({ owner, repo, pull_number: prNumber })
        .then((resp) => resp.data)
        .catch(() => [] as never[]),
      octokit.rest.issues
        .listComments({ owner, repo, issue_number: prNumber })
        .then((resp) => resp.data)
        .catch(() => [] as never[]),
    ]);
    return {
      pr: prResponse.data,
      reviews,
      comments,
    };
  }

  /**
   * Determine the overall review status for a PR from its list of individual reviews.
   * Rules: changes_requested beats approved; pending if there are reviews but none approved/rejected.
   */
  private determineReviewStatus(
    reviews: Array<{
      state: string;
      user: { login: string };
      submitted_at?: string | null;
    }>,
  ): "approved" | "changes_requested" | "pending" | null {
    const latestReviews = new Map<string, string>();
    for (const review of reviews) {
      if (review.state === "APPROVED" || review.state === "CHANGES_REQUESTED") {
        const existing = latestReviews.get(review.user.login);
        if (
          !existing ||
          new Date(review.submitted_at || "") > new Date(existing)
        ) {
          latestReviews.set(review.user.login, review.state);
        }
      }
    }

    const states = Array.from(latestReviews.values());
    const hasApproval = states.some((state) => state === "APPROVED");
    const hasChangesRequested = states.some(
      (state) => state === "CHANGES_REQUESTED",
    );

    if (hasApproval && !hasChangesRequested) return "approved";
    if (hasChangesRequested) return "changes_requested";
    if (reviews.length > 0) return "pending";
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
      const { pr, reviews, comments } = await this.fetchPRApiData(
        octokit,
        owner,
        repo,
        prNumber,
      );

      const reviewStatus = this.determineReviewStatus(reviews);

      const projects = await this.fetchIssueProjects(
        token,
        owner,
        repo,
        prNumber,
      );

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
        reviewStatus,
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
        throw new Error("GitHub token is invalid or expired");
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

        if (link.type === "issue") {
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
    owner: string,
    repo: string,
    title: string,
    body: string,
    labels?: string[],
  ): Promise<unknown> {
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
        throw new Error("GitHub token is invalid or expired");
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
        throw new Error("GitHub token is invalid or expired");
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
        throw new Error("GitHub token is invalid or expired");
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
        throw new Error("GitHub token is invalid or expired");
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
          projectItems(first: 10) {
            nodes {
              id
              project {
                ... on ProjectV2 {
                  id
                  title
                  fields(first: 20) {
                    nodes {
                      ... on ProjectV2SingleSelectField {
                        id
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
   * Fetch Status field options + node IDs from GitHub Projects v2 for a given issue.
   * Returns null when the issue is not linked to a project or has no Status field.
   */
  async fetchProjectStatusOptions(
    token: string,
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<ProjectStatusData | null> {
    try {
      const octokit = this.createClient(token);
      const response =
        await octokit.graphql<ProjectStatusOptionsGraphQLResponse>(
          this.projectStatusOptionsQuery,
          { owner, repo, issueNumber },
        );

      const projectNodes =
        response?.repository?.issue?.projectItems?.nodes ?? [];

      // Collect options from the first project's Status field
      for (const item of projectNodes) {
        if (!item?.id || !item?.project?.id || !item?.project?.fields?.nodes)
          continue;
        for (const field of item.project.fields.nodes) {
          if (!field?.id) continue;
          const fieldName = field.name?.toLowerCase();
          if (fieldName === "status" && field.options?.length) {
            return {
              projectId: item.project.id,
              itemId: item.id,
              fieldId: field.id,
              options: field.options.map((opt) => ({
                id: opt.id,
                name: opt.name,
              })),
            };
          }
        }
      }

      return null;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.warn(
        `Failed to fetch project status options for ${owner}/${repo}#${issueNumber}: ${errorMessage}`,
      );
      return null;
    }
  }
}
