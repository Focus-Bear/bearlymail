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

  it("returns status options from the GitHub Projects v2 GraphQL response", async () => {
    mockGraphql.mockResolvedValue({
      repository: {
        issue: {
          projectItems: {
            nodes: [
              {
                project: {
                  title: "BearlyMail Board",
                  fields: {
                    nodes: [
                      {
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

    const options = await service.fetchProjectStatusOptions(
      "fake-token",
      "Focus-Bear",
      "BearlyMail",
      42,
    );

    expect(options).toEqual([
      { id: "abc1", name: "Backlog" },
      { id: "abc2", name: "In Progress" },
      { id: "abc3", name: "Done" },
    ]);
  });

  it("returns empty array when issue has no project items", async () => {
    mockGraphql.mockResolvedValue({
      repository: {
        issue: {
          projectItems: {
            nodes: [],
          },
        },
      },
    });

    const options = await service.fetchProjectStatusOptions(
      "fake-token",
      "owner",
      "repo",
      1,
    );

    expect(options).toEqual([]);
  });

  it("returns empty array when the project has no Status field", async () => {
    mockGraphql.mockResolvedValue({
      repository: {
        issue: {
          projectItems: {
            nodes: [
              {
                project: {
                  title: "My Board",
                  fields: {
                    nodes: [
                      {
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

    const options = await service.fetchProjectStatusOptions(
      "fake-token",
      "owner",
      "repo",
      1,
    );

    expect(options).toEqual([]);
  });

  it("returns empty array and does not throw when GraphQL call fails", async () => {
    mockGraphql.mockRejectedValue(new Error("GraphQL error"));

    const options = await service.fetchProjectStatusOptions(
      "fake-token",
      "owner",
      "repo",
      1,
    );

    expect(options).toEqual([]);
  });

  it("returns empty array when response is undefined", async () => {
    mockGraphql.mockResolvedValue(undefined);

    const options = await service.fetchProjectStatusOptions(
      "fake-token",
      "owner",
      "repo",
      1,
    );

    expect(options).toEqual([]);
  });
});
