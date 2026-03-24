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

export interface GitHubIssueStatus {
  state: "open" | "closed";
  title: string;
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string; avatar_url: string }>;
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
  reviewStatus: "approved" | "changes_requested" | "pending" | null;
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
