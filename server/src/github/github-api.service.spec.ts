import { Test, TestingModule } from "@nestjs/testing";

import { GitHubProjectStatusService } from "./github-project-status.service";

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

describe("GitHubProjectStatusService - fetchProjectStatusOptions", () => {
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

  it("returns status options from the GitHub Projects v2 GraphQL response", async () => {
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
                          { id: "abc1", name: "Backlog", color: "GRAY" },
                          { id: "abc2", name: "In Progress", color: "YELLOW" },
                          { id: "abc3", name: "Done", color: "GREEN" },
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

    const result = await service.getProjectStatusOptions(
      "fake-token",
      "Focus-Bear",
      "BearlyMail",
      42,
      "BearlyMail Board",
    );

    expect(result).not.toBeNull();
    expect(result).toEqual({
      projectId: "PVT_proj1",
      itemId: "PVTI_item1",
      fieldId: "PVTSSF_field1",
      options: [
        { id: "abc1", name: "Backlog", color: "GRAY" },
        { id: "abc2", name: "In Progress", color: "YELLOW" },
        { id: "abc3", name: "Done", color: "GREEN" },
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

    const result = await service.getProjectStatusOptions(
      "fake-token",
      "owner",
      "repo",
      1,
      "Some Project",
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
                          { id: "p1", name: "High", color: "RED" },
                          { id: "p2", name: "Low", color: "BLUE" },
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

    const result = await service.getProjectStatusOptions(
      "fake-token",
      "owner",
      "repo",
      1,
      "My Board",
    );

    expect(result).toBeNull();
  });

  it("returns null and does not throw when GraphQL call fails", async () => {
    mockGraphql.mockRejectedValue(new Error("GraphQL error"));

    const result = await service.getProjectStatusOptions(
      "fake-token",
      "owner",
      "repo",
      1,
      "Some Project",
    );

    expect(result).toBeNull();
  });

  it("returns null when response is undefined", async () => {
    mockGraphql.mockResolvedValue(undefined);

    const result = await service.getProjectStatusOptions(
      "fake-token",
      "owner",
      "repo",
      1,
      "Some Project",
    );

    expect(result).toBeNull();
  });
});
