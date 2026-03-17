import { Test, TestingModule } from "@nestjs/testing";

import { GitHubApiService } from "./github-api.service";

// Mock @octokit/rest so we don't make real network calls
const mockGraphql = jest.fn();

jest.mock("@octokit/rest", () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    graphql: mockGraphql,
    rest: {
      repos: { get: jest.fn() },
      users: { getAuthenticated: jest.fn() },
    },
  })),
}));

describe("GitHubApiService - fetchProjectStatusOptions", () => {
  let service: GitHubApiService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GitHubApiService],
    }).compile();

    service = module.get<GitHubApiService>(GitHubApiService);
  });

  it("returns status data including node IDs from the GitHub Projects v2 GraphQL response", async () => {
    mockGraphql.mockResolvedValue({
      repository: {
        issue: {
          projectItems: {
            nodes: [
              {
                id: "PVTI_item1",
                project: {
                  id: "PVT_proj1",
                  title: "BearlyMail Board",
                  fields: {
                    nodes: [
                      {
                        id: "PVTSSF_field1",
                        name: "Status",
                        options: [
                          { id: "abc1", name: "Backlog" },
                          { id: "abc2", name: "In Progress" },
                          { id: "abc3", name: "Done" },
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
    });

    const result = await service.fetchProjectStatusOptions(
      "fake-token",
      "Focus-Bear",
      "BearlyMail",
      42,
    );

    expect(result).toEqual({
      projectId: "PVT_proj1",
      itemId: "PVTI_item1",
      fieldId: "PVTSSF_field1",
      options: [
        { id: "abc1", name: "Backlog" },
        { id: "abc2", name: "In Progress" },
        { id: "abc3", name: "Done" },
      ],
    });
  });

  it("returns null when issue has no project items", async () => {
    mockGraphql.mockResolvedValue({
      repository: {
        issue: {
          projectItems: {
            nodes: [],
          },
        },
      },
    });

    const result = await service.fetchProjectStatusOptions(
      "fake-token",
      "owner",
      "repo",
      1,
    );

    expect(result).toBeNull();
  });

  it("returns null when the project has no Status field", async () => {
    mockGraphql.mockResolvedValue({
      repository: {
        issue: {
          projectItems: {
            nodes: [
              {
                id: "PVTI_item1",
                project: {
                  id: "PVT_proj1",
                  title: "My Board",
                  fields: {
                    nodes: [
                      {
                        id: "PVTF_field1",
                        name: "Priority",
                        options: [
                          { id: "p1", name: "High" },
                          { id: "p2", name: "Low" },
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
    });

    const result = await service.fetchProjectStatusOptions(
      "fake-token",
      "owner",
      "repo",
      1,
    );

    expect(result).toBeNull();
  });

  it("returns null and does not throw when GraphQL call fails", async () => {
    mockGraphql.mockRejectedValue(new Error("GraphQL error"));

    const result = await service.fetchProjectStatusOptions(
      "fake-token",
      "owner",
      "repo",
      1,
    );

    expect(result).toBeNull();
  });

  it("returns null when response is undefined", async () => {
    mockGraphql.mockResolvedValue(undefined);

    const result = await service.fetchProjectStatusOptions(
      "fake-token",
      "owner",
      "repo",
      1,
    );

    expect(result).toBeNull();
  });

  it("returns null when item has no id", async () => {
    mockGraphql.mockResolvedValue({
      repository: {
        issue: {
          projectItems: {
            nodes: [
              {
                project: {
                  id: "PVT_proj1",
                  fields: {
                    nodes: [
                      {
                        id: "PVTSSF_field1",
                        name: "Status",
                        options: [{ id: "opt1", name: "Todo" }],
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    });

    const result = await service.fetchProjectStatusOptions(
      "fake-token",
      "owner",
      "repo",
      1,
    );

    expect(result).toBeNull();
  });
});
