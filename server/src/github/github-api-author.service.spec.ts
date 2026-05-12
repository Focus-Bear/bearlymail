import { Test, TestingModule } from "@nestjs/testing";

import { GitHubApiService } from "./github-api.service";
import { GitHubPrEnrichmentService } from "./github-pr-enrichment.service";

const mockPullsGet = jest.fn();
const mockPullsListReviews = jest.fn();
const mockPullsListRequestedReviewers = jest.fn();
const mockIssuesListComments = jest.fn();
const mockIssuesGet = jest.fn();
const mockChecksListForRef = jest.fn();
const mockGraphql = jest.fn();

jest.mock("@octokit/rest", () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    graphql: mockGraphql,
    rest: {
      pulls: {
        get: mockPullsGet,
        listReviews: mockPullsListReviews,
        listRequestedReviewers: mockPullsListRequestedReviewers,
      },
      issues: {
        get: mockIssuesGet,
        listComments: mockIssuesListComments,
      },
      checks: {
        listForRef: mockChecksListForRef,
      },
      repos: { get: jest.fn() },
      users: { getAuthenticated: jest.fn() },
    },
  })),
}));

const basePrData = {
  state: "open",
  title: "Some PR",
  labels: [],
  assignees: [],
  merged: false,
  mergeable: true,
  user: { login: "alice", type: "User" },
  head: { sha: "deadbeef1234" },
};

describe("GitHubApiService PR enrichment", () => {
  let service: GitHubApiService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockGraphql.mockResolvedValue({
      repository: { issue: { projectItems: { nodes: [] } } },
    });
    mockPullsListReviews.mockResolvedValue({ data: [] });
    mockPullsListRequestedReviewers.mockResolvedValue({
      data: { users: [], teams: [] },
    });
    mockIssuesListComments.mockResolvedValue({ data: [] });
    mockChecksListForRef.mockResolvedValue({ data: { check_runs: [] } });

    const module: TestingModule = await Test.createTestingModule({
      providers: [GitHubApiService, GitHubPrEnrichmentService],
    }).compile();

    service = module.get<GitHubApiService>(GitHubApiService);
  });

  describe("author pass-through", () => {
    it("plumbs the bot author through fetchPRStatus", async () => {
      mockPullsGet.mockResolvedValue({
        data: {
          ...basePrData,
          user: { login: "dependabot[bot]", type: "Bot" },
        },
      });

      const result = await service.fetchPRStatus("token", "owner", "repo", 7);

      expect(result?.author).toEqual({ login: "dependabot[bot]", type: "Bot" });
    });

    it("plumbs human authors through fetchPRStatus", async () => {
      mockPullsGet.mockResolvedValue({ data: basePrData });

      const result = await service.fetchPRStatus("token", "owner", "repo", 8);

      expect(result?.author).toEqual({ login: "alice", type: "User" });
    });

    it("returns author=undefined when the PR response omits user", async () => {
      mockPullsGet.mockResolvedValue({
        data: { ...basePrData, user: undefined },
      });

      const result = await service.fetchPRStatus("token", "owner", "repo", 9);

      expect(result?.author).toBeUndefined();
    });

    it("plumbs the author through fetchIssueStatus", async () => {
      mockIssuesGet.mockResolvedValue({
        data: {
          state: "open",
          title: "Bug report",
          labels: [],
          assignees: [],
          user: { login: "bob", type: "User" },
        },
      });

      const result = await service.fetchIssueStatus(
        "token",
        "owner",
        "repo",
        12,
      );

      expect(result?.author).toEqual({ login: "bob", type: "User" });
    });
  });

  describe("reviewer detail", () => {
    it("counts approvals and change-requests from latest-per-user reviews", async () => {
      mockPullsGet.mockResolvedValue({ data: basePrData });
      mockPullsListReviews.mockResolvedValue({
        data: [
          {
            state: "APPROVED",
            user: { login: "alice" },
            submitted_at: "2026-01-01T00:00:00Z",
          },
          {
            state: "APPROVED",
            user: { login: "bob" },
            submitted_at: "2026-01-01T00:00:00Z",
          },
          // Carol changed her mind: later CHANGES_REQUESTED overrides earlier APPROVED.
          {
            state: "APPROVED",
            user: { login: "carol" },
            submitted_at: "2026-01-01T00:00:00Z",
          },
          {
            state: "CHANGES_REQUESTED",
            user: { login: "carol" },
            submitted_at: "2026-01-02T00:00:00Z",
          },
          // COMMENTED is ignored.
          {
            state: "COMMENTED",
            user: { login: "dan" },
            submitted_at: "2026-01-03T00:00:00Z",
          },
        ],
      });

      const result = await service.fetchPRStatus("token", "owner", "repo", 10);

      expect(result?.reviewerDetail).toEqual({
        approvalCount: 2,
        changesRequestedCount: 1,
        requestedReviewers: [],
      });
    });

    it("includes requested users and teams with @-prefix for teams", async () => {
      mockPullsGet.mockResolvedValue({ data: basePrData });
      mockPullsListRequestedReviewers.mockResolvedValue({
        data: {
          users: [{ login: "eve" }, { login: "frank" }],
          teams: [{ slug: "backend", name: "Backend" }],
        },
      });

      const result = await service.fetchPRStatus("token", "owner", "repo", 11);

      expect(result?.reviewerDetail?.requestedReviewers).toEqual([
        "eve",
        "frank",
        "@backend",
      ]);
    });
  });

  describe("checks pass-through", () => {
    it("returns state=passing when all check runs succeeded", async () => {
      mockPullsGet.mockResolvedValue({ data: basePrData });
      mockChecksListForRef.mockResolvedValue({
        data: {
          check_runs: [
            { name: "tests", status: "completed", conclusion: "success" },
            { name: "lint", status: "completed", conclusion: "success" },
          ],
        },
      });

      const result = await service.fetchPRStatus("token", "owner", "repo", 12);

      expect(result?.checks).toEqual({
        state: "passing",
        total: 2,
        failingChecks: [],
      });
    });

    it("returns state=failing with names of failing checks", async () => {
      mockPullsGet.mockResolvedValue({ data: basePrData });
      mockChecksListForRef.mockResolvedValue({
        data: {
          check_runs: [
            { name: "tests", status: "completed", conclusion: "failure" },
            { name: "lint", status: "completed", conclusion: "success" },
            {
              name: "deploy-preview",
              status: "completed",
              conclusion: "cancelled",
            },
          ],
        },
      });

      const result = await service.fetchPRStatus("token", "owner", "repo", 13);

      expect(result?.checks?.state).toBe("failing");
      expect(result?.checks?.failingChecks).toEqual([
        "tests",
        "deploy-preview",
      ]);
    });

    it("returns state=pending when any run is in_progress and none has failed", async () => {
      mockPullsGet.mockResolvedValue({ data: basePrData });
      mockChecksListForRef.mockResolvedValue({
        data: {
          check_runs: [
            { name: "tests", status: "completed", conclusion: "success" },
            { name: "deploy", status: "in_progress", conclusion: null },
          ],
        },
      });

      const result = await service.fetchPRStatus("token", "owner", "repo", 14);

      expect(result?.checks?.state).toBe("pending");
    });

    it("returns checks=undefined when the API errors (silent degrade)", async () => {
      mockPullsGet.mockResolvedValue({ data: basePrData });
      mockChecksListForRef.mockRejectedValue(new Error("403 forbidden"));

      const result = await service.fetchPRStatus("token", "owner", "repo", 15);

      // The PR data still came through fine — checks just absent.
      expect(result).not.toBeNull();
      expect(result?.checks).toBeUndefined();
    });

    it("does not call checks API when PR head SHA is missing", async () => {
      mockPullsGet.mockResolvedValue({
        data: { ...basePrData, head: undefined },
      });

      const result = await service.fetchPRStatus("token", "owner", "repo", 16);

      expect(mockChecksListForRef).not.toHaveBeenCalled();
      expect(result?.checks).toBeUndefined();
    });
  });
});
