import { Injectable, Logger } from "@nestjs/common";
import { Octokit } from "@octokit/rest";
import { ParsedGitHubLink } from "./github.service";

export interface GitHubIssueStatus {
  state: "open" | "closed";
  title: string;
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string; avatar_url: string }>;
  project?: string;
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
  project?: string;
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
      
      // Log the API endpoint being called
      const apiUrl = `GET /repos/${owner}/${repo}/issues/${issueNumber}`;
      this.logger.debug(
        `Fetching issue: ${owner}/${repo}#${issueNumber} (${apiUrl})`,
      );
      
      const response = await octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });

      const issue = response.data;

      // Try to get project information (if issue is in a project)
      let project: string | undefined;
      try {
        // Note: Getting project info requires additional API calls
        // For now, we'll skip it to avoid rate limits
        // Can be enhanced later with GraphQL API
      } catch (error) {
        // Ignore project fetch errors
      }

      return {
        state: issue.state as "open" | "closed",
        title: issue.title,
        labels: issue.labels.map((label: any) => ({
          name: typeof label === "string" ? label : label.name,
          color: typeof label === "string" ? "000000" : label.color || "000000",
        })),
        assignees: issue.assignees.map((assignee) => ({
          login: assignee.login,
          avatar_url: assignee.avatar_url,
        })),
        project,
      };
    } catch (error: any) {
      const apiUrl = `GET /repos/${owner}/${repo}/issues/${issueNumber}`;
      const fullUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
      
      this.logger.error(
        `Failed to fetch issue ${owner}/${repo}#${issueNumber}`,
        {
          message: error.message,
          status: error.status,
          statusText: error.response?.statusText,
          url: fullUrl,
          apiEndpoint: apiUrl,
          owner,
          repo,
          issueNumber,
          // Log response details if available
          responseData: error.response?.data,
          // Check if it's a permissions issue
          isPermissionError: error.status === 401 || error.status === 403,
          isNotFound: error.status === 404,
        },
      );
      
      if (error.status === 401 || error.status === 403) {
        throw new Error("GitHub token is invalid or expired");
      }
      
      // Log additional context for 404 errors
      if (error.status === 404) {
        this.logger.warn(
          `Issue ${owner}/${repo}#${issueNumber} not found. Possible reasons: Issue doesn't exist, repository is private and token lacks access, or repository/issue was deleted.`,
        );
      }
      
      return null;
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

      // Log the API endpoint being called
      const apiUrl = `GET /repos/${owner}/${repo}/pulls/${prNumber}`;
      this.logger.debug(
        `Fetching PR: ${owner}/${repo}#${prNumber} (${apiUrl})`,
      );

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
            .catch(() => ({ data: [] })), // Ignore errors, default to empty
          octokit.rest.issues
            .listComments({
              owner,
              repo,
              issue_number: prNumber,
            })
            .catch(() => ({ data: [] })), // Ignore errors, default to empty
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

      // Try to get project information
      let project: string | undefined;
      try {
        // Note: Getting project info requires additional API calls
        // For now, we'll skip it to avoid rate limits
      } catch (error) {
        // Ignore project fetch errors
      }

      return {
        state: pr.merged ? "merged" : (pr.state as "open" | "closed"),
        title: pr.title,
        labels: pr.labels.map((label: any) => ({
          name: typeof label === "string" ? label : label.name,
          color: typeof label === "string" ? "000000" : label.color || "000000",
        })),
        assignees: pr.assignees.map((assignee) => ({
          login: assignee.login,
          avatar_url: assignee.avatar_url,
        })),
        reviewStatus,
        commentsCount: comments.length,
        mergeable: pr.mergeable,
        merged: pr.merged || false,
        project,
      };
    } catch (error: any) {
      const apiUrl = `GET /repos/${owner}/${repo}/pulls/${prNumber}`;
      const fullUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
      
      this.logger.error(
        `Failed to fetch PR ${owner}/${repo}#${prNumber}`,
        {
          message: error.message,
          status: error.status,
          statusText: error.response?.statusText,
          url: fullUrl,
          apiEndpoint: apiUrl,
          owner,
          repo,
          prNumber,
          // Log response details if available
          responseData: error.response?.data,
          // Check if it's a permissions issue
          isPermissionError: error.status === 401 || error.status === 403,
          isNotFound: error.status === 404,
        },
      );
      
      if (error.status === 401 || error.status === 403) {
        throw new Error("GitHub token is invalid or expired");
      }
      
      // Log additional context for 404 errors
      if (error.status === 404) {
        this.logger.warn(
          `PR ${owner}/${repo}#${prNumber} not found. Possible reasons: PR doesn't exist, repository is private and token lacks access, or repository/PR was deleted.`,
        );
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
      } catch (error: any) {
        this.logger.error(
          `Error fetching status for ${link.url}: ${error.message}`,
        );
      }
    });

    await Promise.all(promises);
    return results;
  }
}
