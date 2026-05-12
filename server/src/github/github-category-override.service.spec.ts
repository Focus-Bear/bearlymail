import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { UserContext } from "../database/entities/user-context.entity";
import {
  GITHUB_RESERVED_CATEGORY_KEYS,
  GitHubCategoryOverrideService,
} from "./github-category-override.service";

type Link = {
  status?: {
    author?: { login: string; type: "User" | "Bot" | "Organization" };
    reviewerDetail?: { requestedReviewers: string[] };
  };
};

describe("GitHubCategoryOverrideService.resolveCategoryKey", () => {
  let service: GitHubCategoryOverrideService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitHubCategoryOverrideService,
        // resolveCategoryKey is pure — never touches the repo. A stub is enough.
        { provide: getRepositoryToken(UserContext), useValue: {} },
      ],
    }).compile();
    service = module.get(GitHubCategoryOverrideService);
  });

  const callResolve = (links: Link[], githubUsername: string | null) =>
    service.resolveCategoryKey(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      links as any,
      githubUsername,
    );

  it("returns null for empty/missing links", () => {
    expect(callResolve([], "alice")).toBeNull();
    expect(service.resolveCategoryKey(undefined, "alice")).toBeNull();
  });

  it("routes bot-authored PRs to BOT_UPDATES", () => {
    const links: Link[] = [
      { status: { author: { login: "dependabot[bot]", type: "Bot" } } },
    ];
    expect(callResolve(links, "alice")).toBe(
      GITHUB_RESERVED_CATEGORY_KEYS.BOT_UPDATES,
    );
  });

  it("routes PRs awaiting the current user's review to AWAITING_REVIEW", () => {
    const links: Link[] = [
      {
        status: {
          author: { login: "carol", type: "User" },
          reviewerDetail: { requestedReviewers: ["alice", "@backend"] },
        },
      },
    ];
    expect(callResolve(links, "alice")).toBe(
      GITHUB_RESERVED_CATEGORY_KEYS.AWAITING_REVIEW,
    );
  });

  it("matches the user's login case-insensitively", () => {
    const links: Link[] = [
      {
        status: {
          author: { login: "carol", type: "User" },
          reviewerDetail: { requestedReviewers: ["Alice"] },
        },
      },
    ];
    expect(callResolve(links, "alice")).toBe(
      GITHUB_RESERVED_CATEGORY_KEYS.AWAITING_REVIEW,
    );
  });

  it("prefers AWAITING_REVIEW over BOT_UPDATES when both signals apply", () => {
    // Dependabot opened a PR and tagged Alice as a reviewer.
    const links: Link[] = [
      {
        status: {
          author: { login: "dependabot[bot]", type: "Bot" },
          reviewerDetail: { requestedReviewers: ["alice"] },
        },
      },
    ];
    expect(callResolve(links, "alice")).toBe(
      GITHUB_RESERVED_CATEGORY_KEYS.AWAITING_REVIEW,
    );
  });

  it("ignores the awaiting-review signal when user has no GitHub login stored", () => {
    const links: Link[] = [
      {
        status: {
          author: { login: "carol", type: "User" },
          reviewerDetail: { requestedReviewers: ["alice"] },
        },
      },
    ];
    expect(callResolve(links, null)).toBeNull();
  });

  it("returns null when neither signal applies", () => {
    const links: Link[] = [
      {
        status: {
          author: { login: "carol", type: "User" },
          reviewerDetail: { requestedReviewers: ["bob"] },
        },
      },
    ];
    expect(callResolve(links, "alice")).toBeNull();
  });
});
