import { Test, TestingModule } from "@nestjs/testing";

import { GitHubProjectStatusService } from "./github-project-status.service";

// ---------------------------------------------------------------------------
// Mock Octokit so no real HTTP requests are made
// ---------------------------------------------------------------------------
const mockGraphql = jest.fn();

jest.mock("@octokit/rest", () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    graphql: mockGraphql,
  })),
}));

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const MOCK_TOKEN = "ghp_test_token";
const OWNER = "Focus-Bear";
const REPO = "windows-app-v2";
const ISSUE_NUMBER = 42;
const PROJECT_NAME = "Focus Bear Backlog";

const MOCK_PROJECT_ITEM_RESPONSE = {
  repository: {
    issue: {
      projectItems: {
        nodes: [
          {
            id: "PVTI_itemId",
            project: {
              id: "PVT_projectId",
              title: PROJECT_NAME,
              fields: {
                nodes: [
                  {
                    id: "PVTSSF_fieldId",
                    name: "Status",
                    options: [
                      { id: "opt1", name: "Todo", color: "RED" },
                      { id: "opt2", name: "In Progress", color: "YELLOW" },
                      { id: "opt3", name: "Done", color: "GREEN" },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    },
  },
};

// ---------------------------------------------------------------------------

describe("GitHubProjectStatusService", () => {
  let service: GitHubProjectStatusService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GitHubProjectStatusService],
    }).compile();

    service = module.get<GitHubProjectStatusService>(
      GitHubProjectStatusService,
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // getProjectStatusOptions
  // -------------------------------------------------------------------------

  describe("getProjectStatusOptions", () => {
    it("should return project status options when found", async () => {
      mockGraphql.mockResolvedValue(MOCK_PROJECT_ITEM_RESPONSE);

      const result = await service.getProjectStatusOptions(
        MOCK_TOKEN,
        OWNER,
        REPO,
        ISSUE_NUMBER,
        PROJECT_NAME,
      );

      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        projectId: "PVT_projectId",
        itemId: "PVTI_itemId",
        fieldId: "PVTSSF_fieldId",
        options: [
          { id: "opt1", name: "Todo", color: "RED" },
          { id: "opt2", name: "In Progress", color: "YELLOW" },
          { id: "opt3", name: "Done", color: "GREEN" },
        ],
      });
    });

    it("should return null when no project items exist", async () => {
      mockGraphql.mockResolvedValue({
        repository: { issue: { projectItems: { nodes: [] } } },
      });

      const result = await service.getProjectStatusOptions(
        MOCK_TOKEN,
        OWNER,
        REPO,
        ISSUE_NUMBER,
        PROJECT_NAME,
      );

      expect(result).toBeNull();
    });

    it("should return null when the named project is not found", async () => {
      mockGraphql.mockResolvedValue(MOCK_PROJECT_ITEM_RESPONSE);

      const result = await service.getProjectStatusOptions(
        MOCK_TOKEN,
        OWNER,
        REPO,
        ISSUE_NUMBER,
        "Nonexistent Project",
      );

      expect(result).toBeNull();
    });

    it("should return null when there is no Status field", async () => {
      const response = {
        repository: {
          issue: {
            projectItems: {
              nodes: [
                {
                  id: "PVTI_itemId",
                  project: {
                    id: "PVT_projectId",
                    title: PROJECT_NAME,
                    fields: {
                      nodes: [
                        {
                          id: "PVTF_otherFieldId",
                          name: "Priority",
                          options: [{ id: "p1", name: "High", color: "RED" }],
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      };
      mockGraphql.mockResolvedValue(response);

      const result = await service.getProjectStatusOptions(
        MOCK_TOKEN,
        OWNER,
        REPO,
        ISSUE_NUMBER,
        PROJECT_NAME,
      );

      expect(result).toBeNull();
    });

    it("should return null and not rethrow on generic API errors", async () => {
      mockGraphql.mockRejectedValue(new Error("Some unexpected GraphQL error"));

      const result = await service.getProjectStatusOptions(
        MOCK_TOKEN,
        OWNER,
        REPO,
        ISSUE_NUMBER,
        PROJECT_NAME,
      );

      expect(result).toBeNull();
    });

    it("should rethrow on 401 authentication errors", async () => {
      mockGraphql.mockRejectedValue(new Error("401 Bad credentials"));

      await expect(
        service.getProjectStatusOptions(
          MOCK_TOKEN,
          OWNER,
          REPO,
          ISSUE_NUMBER,
          PROJECT_NAME,
        ),
      ).rejects.toThrow("401 Bad credentials");
    });

    it("should rethrow on 403 forbidden errors", async () => {
      mockGraphql.mockRejectedValue(new Error("403 Forbidden"));

      await expect(
        service.getProjectStatusOptions(
          MOCK_TOKEN,
          OWNER,
          REPO,
          ISSUE_NUMBER,
          PROJECT_NAME,
        ),
      ).rejects.toThrow("403 Forbidden");
    });

    it("should throw an actionable message when the token lacks the project scope", async () => {
      mockGraphql.mockRejectedValue(
        new Error(
          "Request failed due to following response errors:\n - Your token has not been granted the required scopes to execute this query. The 'projectV2' field requires one of the following scopes: ['read:project'], but your token has only been granted the: ['repo'] scopes.",
        ),
      );

      await expect(
        service.getProjectStatusOptions(
          MOCK_TOKEN,
          OWNER,
          REPO,
          ISSUE_NUMBER,
          PROJECT_NAME,
        ),
      ).rejects.toThrow("reconnect your GitHub account");
    });

    it("should rethrow on 429 rate-limit errors", async () => {
      mockGraphql.mockRejectedValue(new Error("429 rate limit exceeded"));

      await expect(
        service.getProjectStatusOptions(
          MOCK_TOKEN,
          OWNER,
          REPO,
          ISSUE_NUMBER,
          PROJECT_NAME,
        ),
      ).rejects.toThrow("429 rate limit exceeded");
    });
  });

  // -------------------------------------------------------------------------
  // updateProjectItemStatus
  // -------------------------------------------------------------------------

  describe("updateProjectItemStatus", () => {
    it("should call graphql mutation with the correct variables", async () => {
      mockGraphql.mockResolvedValue({
        updateProjectV2ItemFieldValue: { projectV2Item: { id: "PVTI_itemId" } },
      });

      await service.updateProjectItemStatus(
        MOCK_TOKEN,
        "PVT_projectId",
        "PVTI_itemId",
        "PVTSSF_fieldId",
        "opt2",
      );

      expect(mockGraphql).toHaveBeenCalledWith(
        expect.stringContaining("updateProjectV2ItemFieldValue"),
        {
          projectId: "PVT_projectId",
          itemId: "PVTI_itemId",
          fieldId: "PVTSSF_fieldId",
          optionId: "opt2",
        },
      );
    });

    it("should not throw on successful mutation", async () => {
      mockGraphql.mockResolvedValue({});

      await expect(
        service.updateProjectItemStatus(
          MOCK_TOKEN,
          "PVT_projectId",
          "PVTI_itemId",
          "PVTSSF_fieldId",
          "opt1",
        ),
      ).resolves.toBeUndefined();
    });

    it("should rethrow with a friendly message on 401 errors", async () => {
      mockGraphql.mockRejectedValue(new Error("401 Bad credentials"));

      await expect(
        service.updateProjectItemStatus(
          MOCK_TOKEN,
          "PVT_projectId",
          "PVTI_itemId",
          "PVTSSF_fieldId",
          "opt1",
        ),
      ).rejects.toThrow("GitHub token is invalid or expired");
    });

    it("should throw an actionable message when the token lacks the project scope", async () => {
      mockGraphql.mockRejectedValue(
        new Error(
          "Request failed due to following response errors:\n - Your token has not been granted the required scopes to execute this query. The 'updateProjectV2ItemFieldValue' field requires one of the following scopes: ['project'], but your token has only been granted the: ['read:org', 'read:project', 'repo'] scopes.",
        ),
      );

      await expect(
        service.updateProjectItemStatus(
          MOCK_TOKEN,
          "PVT_projectId",
          "PVTI_itemId",
          "PVTSSF_fieldId",
          "opt1",
        ),
      ).rejects.toThrow("reconnect your GitHub account");
    });

    it("should rethrow the original error on non-auth failures", async () => {
      const originalError = new Error(
        "GraphQL mutation failed: field not found",
      );
      mockGraphql.mockRejectedValue(originalError);

      await expect(
        service.updateProjectItemStatus(
          MOCK_TOKEN,
          "PVT_projectId",
          "PVTI_itemId",
          "PVTSSF_fieldId",
          "opt1",
        ),
      ).rejects.toThrow("GraphQL mutation failed: field not found");
    });
  });
});
