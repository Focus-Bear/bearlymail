import { Injectable, Logger } from "@nestjs/common";
import { Octokit } from "@octokit/rest";
import { ParsedGitHubLink } from "./github.service";
import { isApiError, getErrorMessage } from "../types/common";

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
  data?: ProjectItemsGraphQLResponse;
  response?: { data?: ProjectItemsGraphQLResponse };
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
      if (isApiError(error) && error.code === 404) {
        // Could be "doesn't exist" or "no access" - we can't distinguish
        return { accessible: false };
      }
      // Other errors (401, 403) indicate permission issues
      return { accessible: false };
    }
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

      const query = `
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

      let response: ProjectItemsGraphQLResponse | undefined;
      try {
        response = await octokit.graphql<ProjectItemsGraphQLResponse>(query, {
          owner,
          repo,
          issueNumber,
        });
      } catch (error: unknown) {
        // GraphQL can return errors but still have data in the response
        // Check multiple possible locations for the data
        const graphqlError = error as GraphQLErrorWithData;
        if (graphqlError?.responseData) {
          response = graphqlError.responseData;
        } else if (graphqlError?.data) {
          response = graphqlError.data;
        } else if (graphqlError?.response?.data) {
          response = graphqlError.response.data;
        } else {
          // No data in error - return empty (don't throw to avoid breaking the flow)
          return [];
        }
      }

      if (!response?.repository?.issue?.projectItems?.nodes) {
        return [];
      }

      const projects: Array<{ name: string; status?: string }> = [];

      // Check if we have null items (indicates permission issue with read:project scope)
      const nullItemCount = response.repository.issue.projectItems.nodes.filter(
        (item) => item === null,
      ).length;
      if (
        nullItemCount > 0 &&
        response.repository.issue.projectItems.nodes.length === nullItemCount
      ) {
        // All items are null - token may be missing 'read:project' permission
        this.logger.warn(
          `GitHub token may need 'Projects' permission - project items returned as null for ${owner}/${repo}#${issueNumber}`,
        );
      }

      for (const item of response.repository.issue.projectItems.nodes) {
        // Skip null items (GitHub API returns null when token lacks project permissions)
        if (!item) continue;

        const projectName = item?.project?.title;
        let status: string | undefined;

        // Find the status field value
        if (item.fieldValues?.nodes) {
          for (const fieldValue of item.fieldValues.nodes) {
            if (!fieldValue) continue;
            const fieldName = fieldValue.field?.name?.toLowerCase();
            if (fieldName === "status") {
              status = fieldValue.name;
              break;
            }
          }
        }

        // Only add project if we have a name or status
        if (projectName || status) {
          projects.push({
            name: projectName || "Unknown Project",
            ...(status && { status }),
          });
        }
      }

      return projects;
    } catch (error: unknown) {
      // Log error but don't throw - we want to continue even if project fetching fails
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
          isPermissionError: errorStatus === 401 || errorStatus === 403,
          isNotFound: errorStatus === 404,
        },
      );

      if (errorStatus === 401 || errorStatus === 403) {
        throw new Error("GitHub token is invalid or expired");
      }

      // Log additional context for 404 errors
      if (errorStatus === 404) {
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
   * Fetch pull request details from GitHub API
   */
  // eslint-disable-next-line max-lines-per-function, complexity, max-statements
  async fetchPRStatus(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<GitHubPRStatus | null> {
    try {
      const octokit = this.createClient(token);

      // Fetch PR details
      const [prResponse, reviewsResponse, commentsResponse] = await Promise.all(
        [
          octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: prNumber,
          }),
          octokit.rest.pulls
            .listReviews({
              owner,
              repo,
              pull_number: prNumber,
            })
            // eslint-disable-next-line id-denylist
            .catch(() => ({ data: [] })),
          // Ignore errors, default to empty
          octokit.rest.issues
            .listComments({
              owner,
              repo,
              issue_number: prNumber,
            })
            // eslint-disable-next-line id-denylist
            .catch(() => ({ data: [] })),
          // Ignore errors, default to empty
        ],
      );

      const pr = prResponse.data;
      const reviews = reviewsResponse.data;
      const comments = commentsResponse.data;

      // Determine review status
      let reviewStatus: "approved" | "changes_requested" | "pending" | null =
        null;
      const latestReviews = new Map<string, string>();

      // Get the latest review state for each reviewer
      for (const review of reviews) {
        if (
          review.state === "APPROVED" ||
          review.state === "CHANGES_REQUESTED"
        ) {
          const existing = latestReviews.get(review.user.login);
          if (
            !existing ||
            new Date(review.submitted_at || "") > new Date(existing)
          ) {
            latestReviews.set(review.user.login, review.state);
          }
        }
      }

      // Determine overall review status
      const hasApproval = Array.from(latestReviews.values()).some(
        (state) => state === "APPROVED",
      );
      const hasChangesRequested = Array.from(latestReviews.values()).some(
        (state) => state === "CHANGES_REQUESTED",
      );

      if (hasApproval && !hasChangesRequested) {
        reviewStatus = "approved";
      } else if (hasChangesRequested) {
        reviewStatus = "changes_requested";
      } else if (reviews.length > 0) {
        reviewStatus = "pending";
      }

      // Fetch project information using GraphQL (PRs use the same issue endpoint)
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
        // Log response details if available
        responseData: errorResponse?.data,
        // Check if it's a permissions issue
        isPermissionError: errorStatus === 401 || errorStatus === 403,
        isNotFound: errorStatus === 404,
      });

      if (errorStatus === 401 || errorStatus === 403) {
        throw new Error("GitHub token is invalid or expired");
      }

      // Log additional context for 404 errors
      if (errorStatus === 404) {
        // Try to check if we can access the repository at all
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
      if (errorStatus === 401 || errorStatus === 403) {
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
      if (errorStatus === 401 || errorStatus === 403) {
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
      if (errorStatus === 401 || errorStatus === 403) {
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
      if (errorStatus === 401 || errorStatus === 403) {
        throw new Error("GitHub token is invalid or expired");
      }
      throw error;
    }
  }
}
