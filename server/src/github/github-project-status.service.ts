import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { Octokit } from "@octokit/rest";

import { GITHUB_FIELD_NAMES } from "../constants/domain-types";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { getErrorMessage } from "../types/common";

/**
 * GraphQL response for fetching full project status options (including node IDs for mutation)
 */
interface ProjectStatusFullOptionsGraphQLResponse {
  repository?: {
    issue?: {
      projectItems?: {
        nodes?: Array<{
          /** itemId — ProjectV2Item node ID */
          id?: string;
          project?: {
            /** projectId */
            id?: string;
            title?: string;
            fields?: {
              nodes?: Array<{
                /** fieldId */
                id?: string;
                name?: string;
                options?: Array<{
                  id: string;
                  name: string;
                  color: string;
                }>;
              } | null>;
            };
          };
        } | null>;
      };
    };
  };
}

/**
 * Handles GitHub Projects v2 status field operations:
 * - Fetching available status options (with node IDs) for an issue's project
 * - Updating a project item's Status field via GraphQL mutation
 *
 * Extracted from GitHubApiService to keep that file within the max-lines limit.
 */
@Injectable()
export class GitHubProjectStatusService {
  private readonly logger = new Logger(GitHubProjectStatusService.name);

  private createClient(token: string): Octokit {
    return new Octokit({ auth: token });
  }

  private readonly projectStatusFullOptionsQuery = `
    query($owner: String!, $repo: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issueNumber) {
          projectItems(first: 100) {
            nodes {
              id
              project {
                ... on ProjectV2 {
                  id
                  title
                  fields(first: 100) {
                    nodes {
                      ... on ProjectV2SingleSelectField {
                        id
                        name
                        options {
                          id
                          name
                          color
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

  private readonly updateProjectV2ItemFieldValueMutation = `
    mutation UpdateProjectV2ItemFieldValue(
      $projectId: ID!
      $itemId: ID!
      $fieldId: ID!
      $optionId: String!
    ) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $optionId }
        }
      ) {
        projectV2Item {
          id
        }
      }
    }
  `;

  /**
   * Fetch the full project status options including node IDs needed for the
   * updateProjectV2ItemFieldValue mutation.
   *
   * @returns Object with projectId, itemId, fieldId, and options array, or null if not found.
   */
  async getProjectStatusOptions(
    token: string,
    owner: string,
    repo: string,
    issueNumber: number,
    projectName: string,
  ): Promise<{
    projectId: string;
    itemId: string;
    fieldId: string;
    options: Array<{ id: string; name: string; color: string }>;
  } | null> {
    try {
      const octokit = this.createClient(token);
      const response =
        await octokit.graphql<ProjectStatusFullOptionsGraphQLResponse>(
          this.projectStatusFullOptionsQuery,
          { owner, repo, issueNumber },
        );

      const projectNodes =
        response?.repository?.issue?.projectItems?.nodes ?? [];

      for (const item of projectNodes) {
        if (!item?.project) continue;
        const { project } = item;
        if (project.title !== projectName) continue;

        if (!project.fields?.nodes) continue;

        for (const field of project.fields.nodes) {
          if (!field) continue;
          const fieldName = field.name?.toLowerCase();
          if (
            fieldName === GITHUB_FIELD_NAMES.STATUS &&
            field.options?.length
          ) {
            if (!project.id || !item.id || !field.id) continue;
            return {
              projectId: project.id,
              itemId: item.id,
              fieldId: field.id,
              options: field.options.map((opt) => ({
                id: opt.id,
                name: opt.name,
                color: opt.color ?? "",
              })),
            };
          }
        }
      }

      return null;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(
        `Failed to fetch project status options for ${owner}/${repo}#${issueNumber} (project: ${projectName}): ${errorMessage}`,
      );
      const lowerMessage = errorMessage.toLowerCase();
      // GitHub returns scope errors as a GraphQL response error (HTTP 200), so
      // they never match the 401/403 checks below. Detect a missing 'project'
      // scope explicitly so callers surface an actionable message instead of a
      // misleading "Project not found" 404.
      if (lowerMessage.includes("scope") && lowerMessage.includes("project")) {
        throw new ForbiddenException(
          ERROR_MESSAGES.GITHUB_TOKEN_MISSING_PROJECT_SCOPE,
        );
      }
      // Re-throw auth and rate-limit errors so callers get a meaningful error
      // rather than a misleading "Project not found" 404.
      if (
        lowerMessage.includes("401") ||
        lowerMessage.includes("403") ||
        lowerMessage.includes("429") ||
        lowerMessage.includes("bad credentials") ||
        lowerMessage.includes("unauthorized") ||
        lowerMessage.includes("rate limit")
      ) {
        throw error;
      }
      return null;
    }
  }

  /**
   * Update a GitHub Projects v2 item's Status field via the
   * updateProjectV2ItemFieldValue GraphQL mutation.
   */
  async updateProjectItemStatus(
    token: string,
    projectId: string,
    itemId: string,
    fieldId: string,
    singleSelectOptionId: string,
  ): Promise<void> {
    try {
      const octokit = this.createClient(token);
      await octokit.graphql(this.updateProjectV2ItemFieldValueMutation, {
        projectId,
        itemId,
        fieldId,
        optionId: singleSelectOptionId,
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(
        `updateProjectItemStatus failed — projectId=${projectId}, itemId=${itemId}, fieldId=${fieldId}, optionId=${singleSelectOptionId}: ${errorMessage}`,
      );
      const lowerMessage = errorMessage.toLowerCase();
      // GitHub returns scope errors as a GraphQL response error (HTTP 200), so
      // they never match the 401/403 checks below. Detect the missing 'project'
      // scope explicitly and surface an actionable message instead of a 500.
      if (lowerMessage.includes("scope") && lowerMessage.includes("project")) {
        throw new ForbiddenException(
          ERROR_MESSAGES.GITHUB_TOKEN_MISSING_PROJECT_SCOPE,
        );
      }
      if (
        lowerMessage.includes("401") ||
        lowerMessage.includes("403") ||
        lowerMessage.includes("bad credentials") ||
        lowerMessage.includes("unauthorized")
      ) {
        throw new ForbiddenException(ERROR_MESSAGES.GITHUB_TOKEN_INVALID);
      }
      throw new InternalServerErrorException(errorMessage);
    }
  }
}
