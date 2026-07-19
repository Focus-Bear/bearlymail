import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { GITHUB_LINK_TYPES } from "../constants/domain-types";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { EmailsService } from "../emails/emails.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UsersService } from "../users/users.service";
import { GitHubService } from "./github.service";
import { GitHubApiService } from "./github-api.service";
import { GitHubEmailInfoService } from "./github-email-info.service";

describe("GitHubEmailInfoService.processEmailGitHubMetadataForJob", () => {
  let service: GitHubEmailInfoService;

  const mockEmailThreadRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockEmailRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockUserContextRepository = {
    findOne: jest.fn(),
  };

  const mockGitHubService = {
    parseGitHubLinks: jest.fn(),
    parseGitHubLinksFromSubject: jest.fn(),
  };

  const mockGitHubApiService = {
    fetchMultipleStatuses: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
  };

  const mockEmailsService = {
    getEmailById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitHubEmailInfoService,
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
        },
        {
          provide: getRepositoryToken(Email),
          useValue: mockEmailRepository,
        },
        {
          provide: getRepositoryToken(UserContext),
          useValue: mockUserContextRepository,
        },
        { provide: GitHubService, useValue: mockGitHubService },
        { provide: GitHubApiService, useValue: mockGitHubApiService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: EmailsService, useValue: mockEmailsService },
      ],
    }).compile();

    service = module.get<GitHubEmailInfoService>(GitHubEmailInfoService);
    jest.clearAllMocks();
  });

  it("stores links without status when user has no GitHub token", async () => {
    jest
      .spyOn(EncryptionHelper, "tryDecrypt")
      .mockImplementation((val) => val ?? "");
    // No GitHub token
    mockUsersService.findOne.mockResolvedValue({ githubToken: null });
    mockEmailRepository.find.mockResolvedValue([
      {
        id: "email-1",
        body: "View PR at https://github.com/owner/repo/pull/42",
        htmlBody: null,
        from: "notifications@github.com",
        subject: "[owner/repo] My PR (#42)",
      },
    ]);
    const parsedLink = {
      type: GITHUB_LINK_TYPES.PR,
      owner: "owner",
      repo: "repo",
      number: 42,
      url: "https://github.com/owner/repo/pull/42",
    };
    mockGitHubService.parseGitHubLinks.mockReturnValue([parsedLink]);
    mockEmailThreadRepository.findOne.mockResolvedValue({
      id: "thread-1",
      userId: "user-1",
      categoryId: null,
      githubMetadata: null,
    });
    mockEmailThreadRepository.save.mockResolvedValue({});

    const result = await service.processEmailGitHubMetadataForJob(
      "user-1",
      "email-1",
      "thread-1",
    );

    // Returns links even without a token
    expect(result).not.toBeNull();
    expect(result?.links).toHaveLength(1);

    // Persists links (without status) so the inbox badge appears
    expect(mockEmailThreadRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "thread-1",
        userId: "user-1",
        githubMetadata: expect.objectContaining({
          links: expect.arrayContaining([
            expect.objectContaining({
              url: "https://github.com/owner/repo/pull/42",
            }),
          ]),
        }),
      }),
    );
    // Never hits the GitHub API
    expect(mockGitHubApiService.fetchMultipleStatuses).not.toHaveBeenCalled();
  });

  it("returns null when no GitHub links found in the thread", async () => {
    jest
      .spyOn(EncryptionHelper, "tryDecrypt")
      .mockImplementation((val) => val ?? "");
    mockUsersService.findOne.mockResolvedValue({
      githubToken: "encrypted-token",
    });
    mockEmailRepository.find.mockResolvedValue([
      {
        id: "email-1",
        body: "No GitHub links here",
        htmlBody: null,
        from: "someone@example.com",
        subject: "Hello",
      },
    ]);
    mockGitHubService.parseGitHubLinks.mockReturnValue([]);
    mockGitHubService.parseGitHubLinksFromSubject.mockReturnValue([]);

    const result = await service.processEmailGitHubMetadataForJob(
      "user-1",
      "email-1",
      "thread-1",
    );

    expect(result).toBeNull();
    expect(mockGitHubApiService.fetchMultipleStatuses).not.toHaveBeenCalled();
  });

  it("stores links without status when GitHub API fails", async () => {
    jest
      .spyOn(EncryptionHelper, "tryDecrypt")
      .mockImplementation((val) => val ?? "");
    mockUsersService.findOne.mockResolvedValue({
      githubToken: "encrypted-token",
    });
    mockEmailRepository.find.mockResolvedValue([
      {
        id: "email-1",
        body: "View PR at https://github.com/owner/repo/pull/42",
        htmlBody: null,
        from: "notifications@github.com",
        subject: "[owner/repo] My PR (#42)",
      },
    ]);
    const parsedLink = {
      type: GITHUB_LINK_TYPES.PR,
      owner: "owner",
      repo: "repo",
      number: 42,
      url: "https://github.com/owner/repo/pull/42",
    };
    mockGitHubService.parseGitHubLinks.mockReturnValue([parsedLink]);
    mockEmailThreadRepository.findOne.mockResolvedValue({
      id: "thread-1",
      userId: "user-1",
      categoryId: null,
      githubMetadata: null,
    });
    // GitHub API throws (rate limit, network error, etc.)
    mockGitHubApiService.fetchMultipleStatuses.mockRejectedValue(
      new Error("GitHub API rate limit exceeded"),
    );
    mockEmailThreadRepository.save.mockResolvedValue({});

    const result = await service.processEmailGitHubMetadataForJob(
      "user-1",
      "email-1",
      "thread-1",
    );

    // Returns links even when API fails
    expect(result).not.toBeNull();
    expect(result?.links).toHaveLength(1);

    // Falls back to storing links without status so the badge still appears
    expect(mockEmailThreadRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "thread-1",
        userId: "user-1",
        githubMetadata: expect.objectContaining({ links: expect.any(Array) }),
      }),
    );
  });

  it("scans ALL thread emails (not just the triggering email)", async () => {
    jest
      .spyOn(EncryptionHelper, "tryDecrypt")
      .mockImplementation((val) => val ?? "");
    mockUsersService.findOne.mockResolvedValue({
      githubToken: "encrypted-token",
    });

    // The thread has two emails: the triggering email (a plain reply) and the
    // original GitHub notification email that contains the PR link.
    const replyEmail = {
      id: "email-2",
      body: "Thanks for reviewing!",
      htmlBody: null,
      from: "user@example.com",
      subject: "Re: [owner/repo] My PR (#42)",
    };
    const githubEmail = {
      id: "email-1",
      body: "View at https://github.com/owner/repo/pull/42",
      htmlBody: null,
      from: "notifications@github.com",
      subject: "[owner/repo] My PR (#42)",
    };
    mockEmailRepository.find.mockResolvedValue([replyEmail, githubEmail]);

    const parsedLink = {
      type: GITHUB_LINK_TYPES.PR,
      owner: "owner",
      repo: "repo",
      number: 42,
      url: "https://github.com/owner/repo/pull/42",
    };
    // Only the github notification email has parseable links
    mockGitHubService.parseGitHubLinks.mockImplementation((body: string) => {
      if (body.includes("github.com/owner/repo/pull/42")) {
        return [parsedLink];
      }
      return [];
    });
    mockGitHubService.parseGitHubLinksFromSubject.mockReturnValue([]);

    const mockStatus = {
      state: "open",
      title: "My PR",
      fetchedAt: expect.any(String),
    };
    mockGitHubApiService.fetchMultipleStatuses.mockResolvedValue(
      new Map([["https://github.com/owner/repo/pull/42", mockStatus]]),
    );
    mockEmailThreadRepository.update.mockResolvedValue({});
    mockEmailThreadRepository.findOne.mockResolvedValue({
      id: "thread-1",
      userId: "user-1",
      categoryId: null,
      githubMetadata: null,
    });

    const result = await service.processEmailGitHubMetadataForJob(
      "user-1",
      "email-2",
      "thread-1",
    );

    // Should have found the link from the GitHub notification email in the thread
    expect(result).not.toBeNull();
    expect(result?.links).toHaveLength(1);
    expect(result?.links[0].url).toBe("https://github.com/owner/repo/pull/42");

    // Should have persisted the metadata to the thread
    expect(mockEmailThreadRepository.update).toHaveBeenCalledWith(
      { id: "thread-1", userId: "user-1" },
      expect.objectContaining({
        githubMetadata: expect.objectContaining({
          links: expect.arrayContaining([
            expect.objectContaining({
              url: "https://github.com/owner/repo/pull/42",
            }),
          ]),
        }),
      }),
    );
  });

  it("reads all emails from the thread (not only triggering email)", async () => {
    jest
      .spyOn(EncryptionHelper, "tryDecrypt")
      .mockImplementation((val) => val ?? "");
    mockUsersService.findOne.mockResolvedValue({
      githubToken: "encrypted-token",
    });
    mockEmailRepository.find.mockResolvedValue([
      {
        id: "email-1",
        body: "See PR",
        htmlBody: null,
        from: "n@github.com",
        subject: "PR",
      },
    ]);
    mockGitHubService.parseGitHubLinks.mockReturnValue([
      {
        type: GITHUB_LINK_TYPES.PR,
        owner: "o",
        repo: "r",
        number: 1,
        url: "https://github.com/o/r/pull/1",
      },
    ]);
    mockGitHubApiService.fetchMultipleStatuses.mockResolvedValue(new Map());
    mockEmailThreadRepository.update.mockResolvedValue({});
    mockEmailThreadRepository.findOne.mockResolvedValue({
      id: "thread-1",
      userId: "user-1",
      categoryId: null,
    });

    await service.processEmailGitHubMetadataForJob(
      "user-1",
      "email-1",
      "thread-1",
    );

    // Verify it queries by emailThreadId (thread UUID), not emailId
    expect(mockEmailRepository.find).toHaveBeenCalledWith({
      where: { userId: "user-1", emailThreadId: "thread-1" },
    });
  });

  const setupFreshCacheScenario = () => {
    jest
      .spyOn(EncryptionHelper, "tryDecrypt")
      .mockImplementation((val) => val ?? "");
    mockUsersService.findOne.mockResolvedValue({
      githubToken: "encrypted-token",
    });
    mockEmailRepository.find.mockResolvedValue([
      {
        id: "email-1",
        body: "View PR at https://github.com/owner/repo/pull/42",
        htmlBody: null,
        from: "notifications@github.com",
        subject: "[owner/repo] My PR (#42)",
      },
    ]);
    mockGitHubService.parseGitHubLinks.mockReturnValue([
      {
        type: GITHUB_LINK_TYPES.PR,
        owner: "owner",
        repo: "repo",
        number: 42,
        url: "https://github.com/owner/repo/pull/42",
      },
    ]);
    // Thread already has a fresh cached status (fetched moments ago).
    mockEmailThreadRepository.findOne.mockResolvedValue({
      id: "thread-1",
      userId: "user-1",
      categoryId: null,
      githubMetadata: {
        links: [
          {
            type: GITHUB_LINK_TYPES.PR,
            owner: "owner",
            repo: "repo",
            number: 42,
            url: "https://github.com/owner/repo/pull/42",
            status: { state: "open" },
            fetchedAt: new Date().toISOString(),
          },
        ],
      },
    });
    mockGitHubApiService.fetchMultipleStatuses.mockResolvedValue(new Map());
    mockEmailThreadRepository.update.mockResolvedValue({});
    mockEmailThreadRepository.save.mockResolvedValue({});
  };

  it("skips the GitHub API when cache is fresh and forceRefresh is false", async () => {
    setupFreshCacheScenario();

    await service.processEmailGitHubMetadataForJob(
      "user-1",
      "email-1",
      "thread-1",
    );

    expect(mockGitHubApiService.fetchMultipleStatuses).not.toHaveBeenCalled();
  });

  it("re-fetches live status when forceRefresh is true even if cache is fresh", async () => {
    setupFreshCacheScenario();

    await service.processEmailGitHubMetadataForJob(
      "user-1",
      "email-1",
      "thread-1",
      true,
    );

    expect(mockGitHubApiService.fetchMultipleStatuses).toHaveBeenCalledTimes(1);
  });
});
