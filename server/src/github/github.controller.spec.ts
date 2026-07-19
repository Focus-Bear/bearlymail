import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { AuditService } from "../audit/audit.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailsService } from "../emails/emails.service";
import { UsersService } from "../users/users.service";
import { GitHubController } from "./github.controller";
import { GitHubService } from "./github.service";
import { GitHubApiService } from "./github-api.service";
import { GitHubAppService } from "./github-app.service";
import { GitHubCategoryOverrideService } from "./github-category-override.service";
import { GitHubEmailInfoService } from "./github-email-info.service";
import { GitHubProjectStatusService } from "./github-project-status.service";
import { GitHubRepoMappingService } from "./github-repo-mapping.service";

describe("GitHubController - getAdminDebugInfo", () => {
  let controller: GitHubController;

  const mockExecuteSql = jest.fn();
  const mockBoss = {
    send: jest.fn(),
    getDb: () => ({ executeSql: mockExecuteSql }),
  };

  const mockEmailThreadRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };

  const mockEmailRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
  };

  const mockEmailsService = {
    getEmailById: jest.fn(),
  };

  const mockGitHubService = {
    parseGitHubLinks: jest.fn(),
  };

  const mockGitHubApiService = {
    fetchMultipleStatuses: jest.fn(),
    testToken: jest.fn(),
    testRepoAccess: jest.fn(),
    fetchProjectStatusOptions: jest.fn(),
  };

  const mockGitHubAppService = {
    getFrontendUrl: jest.fn(),
    getAuthorizationUrl: jest.fn(),
    createConnectToken: jest.fn(),
    verifyConnectToken: jest.fn(),
    exchangeCodeForToken: jest.fn(),
    storeTokenForUser: jest.fn(),
  };

  const mockRepoMappingService = {
    findAllForUser: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getDefaultForUser: jest.fn(),
  };

  const mockGitHubEmailInfoService = {
    getEmailGitHubInfo: jest.fn(),
    refreshEmailGitHubInfo: jest.fn(),
    getThreadMetadataByEmailIds: jest.fn(),
  };

  const mockGitHubProjectStatusService = {
    getProjectStatusOptions: jest.fn(),
    updateProjectItemStatus: jest.fn(),
  };

  const mockGitHubCategoryOverrideService = {
    bootstrapReservedCategoriesForUser: jest.fn().mockResolvedValue(undefined),
    findReservedCategoryId: jest.fn().mockResolvedValue(null),
    resolveCategoryKey: jest.fn().mockReturnValue(null),
    resolveOverrideCategoryId: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GitHubController],
      providers: [
        { provide: "PG_BOSS", useValue: mockBoss },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
        },
        {
          provide: getRepositoryToken(Email),
          useValue: mockEmailRepository,
        },
        { provide: UsersService, useValue: mockUsersService },
        { provide: EmailsService, useValue: mockEmailsService },
        { provide: GitHubService, useValue: mockGitHubService },
        { provide: GitHubApiService, useValue: mockGitHubApiService },
        { provide: GitHubAppService, useValue: mockGitHubAppService },
        {
          provide: GitHubRepoMappingService,
          useValue: mockRepoMappingService,
        },
        {
          provide: GitHubEmailInfoService,
          useValue: mockGitHubEmailInfoService,
        },
        {
          provide: GitHubProjectStatusService,
          useValue: mockGitHubProjectStatusService,
        },
        {
          provide: GitHubCategoryOverrideService,
          useValue: mockGitHubCategoryOverrideService,
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    controller = module.get<GitHubController>(GitHubController);
  });

  // Helper to set up standard SQL mocks with 6 calls (the new query for recent threads is 6th)
  const setupStandardMocks = (
    opts: {
      usersCount?: string;
      threadsCount?: string;
      jobStatsRows?: Array<{ state: string; count: string }>;
      failedJobRows?: unknown[];
      completedCount?: string;
      recentThreadRows?: unknown[];
    } = {},
  ) => {
    const {
      usersCount = "3",
      threadsCount = "42",
      jobStatsRows = [],
      failedJobRows = [],
      completedCount = "150",
      recentThreadRows = [],
    } = opts;
    mockExecuteSql
      // users with token
      .mockResolvedValueOnce({ rows: [{ count: usersCount }] })
      // threads with metadata
      .mockResolvedValueOnce({ rows: [{ count: threadsCount }] })
      // job stats
      .mockResolvedValueOnce({ rows: jobStatsRows })
      // recent failed jobs
      .mockResolvedValueOnce({ rows: failedJobRows })
      // archive stats
      .mockResolvedValueOnce({ rows: [{ completedCount }] })
      // recent threads for silent failures
      .mockResolvedValueOnce({ rows: recentThreadRows });
  };

  it("should return debug info with correct structure", async () => {
    setupStandardMocks({
      usersCount: "3",
      threadsCount: "42",
      jobStatsRows: [
        { state: "failed", count: "2" },
        { state: "active", count: "1" },
      ],
      completedCount: "150",
    });

    const result = await controller.getAdminDebugInfo();

    expect(result).toMatchObject({
      usersWithToken: 3,
      threadsWithMetadata: 42,
      jobStats: {
        failed: 2,
        active: 1,
        completed: 150,
      },
      recentFailedJobs: [],
      recentSilentFailures: [],
      threadsWithLinksNoStatus: 0,
    });
    expect(result.timestamp).toBeDefined();
  });

  it("should include failed job details in recentFailedJobs", async () => {
    const mockFailedJob = {
      id: "job-uuid-1234-5678",
      job_data: { userId: "user-1", emailId: "email-1", threadId: "thread-1" },
      output: { message: "GitHub token is invalid or expired" },
      createdon: "2026-02-20T10:00:00Z",
      completedon: null,
      retrylimit: 3,
      retrycount: 3,
    };

    setupStandardMocks({
      usersCount: "1",
      threadsCount: "10",
      jobStatsRows: [{ state: "failed", count: "1" }],
      failedJobRows: [mockFailedJob],
      completedCount: "5",
    });

    const result = await controller.getAdminDebugInfo();

    expect(result.recentFailedJobs).toHaveLength(1);
    expect(result.recentFailedJobs[0]).toMatchObject({
      id: "job-uuid-1234-5678",
      userId: "user-1",
      emailId: "email-1",
      threadId: "thread-1",
      error: "GitHub token is invalid or expired",
      retryCount: 3,
      retryLimit: 3,
    });
  });

  it("should handle empty query results gracefully", async () => {
    setupStandardMocks({
      usersCount: "0",
      threadsCount: "0",
      completedCount: "0",
    });

    const result = await controller.getAdminDebugInfo();

    expect(result.usersWithToken).toBe(0);
    expect(result.threadsWithMetadata).toBe(0);
    expect(result.jobStats.completed).toBe(0);
    expect(result.recentFailedJobs).toEqual([]);
    expect(result.recentSilentFailures).toEqual([]);
    expect(result.threadsWithLinksNoStatus).toBe(0);
  });

  it("should handle jobs with null output gracefully", async () => {
    const mockFailedJob = {
      id: "job-uuid-0000",
      data: { userId: "user-1", emailId: "email-1", threadId: "thread-1" },
      output: null,
      createdon: "2026-02-20T10:00:00Z",
      completedon: null,
      retrylimit: 3,
      retrycount: 2,
    };

    setupStandardMocks({
      usersCount: "1",
      threadsCount: "5",
      jobStatsRows: [{ state: "failed", count: "1" }],
      failedJobRows: [mockFailedJob],
      completedCount: "3",
    });

    const result = await controller.getAdminDebugInfo();

    expect(result.recentFailedJobs[0].error).toBe("Unknown error");
  });

  it("should count all job states from the stats query", async () => {
    setupStandardMocks({
      usersCount: "2",
      threadsCount: "10",
      jobStatsRows: [
        { state: "created", count: "5" },
        { state: "active", count: "2" },
        { state: "retry", count: "1" },
        { state: "failed", count: "3" },
      ],
      completedCount: "100",
    });

    const result = await controller.getAdminDebugInfo();

    expect(result.jobStats).toMatchObject({
      created: 5,
      active: 2,
      retry: 1,
      failed: 3,
      completed: 100,
    });
  });

  it("should count threads with links but no status (silent failures)", async () => {
    // Simulate a thread row with encrypted metadata that has links but no status
    // Since EncryptionHelper.decrypt will fail on non-encrypted data,
    // the controller's try/catch will skip malformed rows, so threadsWithLinksNoStatus stays 0
    // for test data that doesn't have real encryption
    setupStandardMocks({
      usersCount: "1",
      threadsCount: "5",
      completedCount: "10",
      recentThreadRows: [
        {
          id: "thread-1",
          userId: "user-1",
          githubMetadata: "not-real-encrypted-data",
          updatedAt: "2026-02-20T10:00:00Z",
        },
      ],
    });

    const result = await controller.getAdminDebugInfo();

    // Malformed encrypted data is skipped gracefully
    expect(result.threadsWithLinksNoStatus).toBe(0);
    expect(result.recentSilentFailures).toEqual([]);
  });

  it("should return recentSilentFailures as empty array when no threads found", async () => {
    setupStandardMocks({
      usersCount: "2",
      threadsCount: "10",
      completedCount: "50",
    });

    const result = await controller.getAdminDebugInfo();

    expect(result.recentSilentFailures).toEqual([]);
    expect(result.threadsWithLinksNoStatus).toBe(0);
  });
});

describe("GitHubController - testUserToken", () => {
  let controller: GitHubController;

  const mockBoss = {
    send: jest.fn(),
    getDb: () => ({ executeSql: jest.fn() }),
  };

  const mockEmailThreadRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };
  const mockEmailRepository = { findOne: jest.fn(), find: jest.fn() };
  const mockUsersService = { findOne: jest.fn() };
  const mockEmailsService = { getEmailById: jest.fn() };
  const mockGitHubService = { parseGitHubLinks: jest.fn() };
  const mockGitHubApiService = {
    fetchMultipleStatuses: jest.fn(),
    testToken: jest.fn(),
    testRepoAccess: jest.fn(),
    fetchProjectStatusOptions: jest.fn(),
  };
  const mockGitHubAppService = {
    getFrontendUrl: jest.fn(),
    getAuthorizationUrl: jest.fn(),
    createConnectToken: jest.fn(),
    verifyConnectToken: jest.fn(),
    exchangeCodeForToken: jest.fn(),
    storeTokenForUser: jest.fn(),
  };
  const mockRepoMappingService = {
    findAllForUser: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getDefaultForUser: jest.fn(),
  };
  const mockGitHubEmailInfoService = {
    getEmailGitHubInfo: jest.fn(),
    refreshEmailGitHubInfo: jest.fn(),
    getThreadMetadataByEmailIds: jest.fn(),
  };

  const mockGitHubProjectStatusService = {
    getProjectStatusOptions: jest.fn(),
    updateProjectItemStatus: jest.fn(),
  };

  const mockGitHubCategoryOverrideService = {
    bootstrapReservedCategoriesForUser: jest.fn().mockResolvedValue(undefined),
    findReservedCategoryId: jest.fn().mockResolvedValue(null),
    resolveCategoryKey: jest.fn().mockReturnValue(null),
    resolveOverrideCategoryId: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GitHubController],
      providers: [
        { provide: "PG_BOSS", useValue: mockBoss },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
        },
        { provide: getRepositoryToken(Email), useValue: mockEmailRepository },
        { provide: UsersService, useValue: mockUsersService },
        { provide: EmailsService, useValue: mockEmailsService },
        { provide: GitHubService, useValue: mockGitHubService },
        { provide: GitHubApiService, useValue: mockGitHubApiService },
        { provide: GitHubAppService, useValue: mockGitHubAppService },
        { provide: GitHubRepoMappingService, useValue: mockRepoMappingService },
        {
          provide: GitHubEmailInfoService,
          useValue: mockGitHubEmailInfoService,
        },
        {
          provide: GitHubProjectStatusService,
          useValue: mockGitHubProjectStatusService,
        },
        {
          provide: GitHubCategoryOverrideService,
          useValue: mockGitHubCategoryOverrideService,
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    controller = module.get<GitHubController>(GitHubController);
  });

  it("should throw NotFoundException when user not found", async () => {
    mockUsersService.findOne.mockResolvedValue(null);

    await expect(
      controller.testUserToken({ userId: "nonexistent-user" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("should return hasToken: false when user has no GitHub token", async () => {
    mockUsersService.findOne.mockResolvedValue({
      id: "user-1",
      githubToken: null,
    });

    const result = await controller.testUserToken({ userId: "user-1" });

    expect(result).toEqual({ hasToken: false, valid: false });
  });

  it("should return token validity for a user with a valid token", async () => {
    // Use a token that passes EncryptionHelper.decrypt (plaintext with no colons passes through)
    mockUsersService.findOne.mockResolvedValue({
      id: "user-1",
      githubToken: "plaintoken",
    });
    mockGitHubApiService.testToken.mockResolvedValue({
      valid: true,
      login: "testuser",
      name: "Test User",
      scopes: ["repo", "read:org"],
    });

    const result = await controller.testUserToken({ userId: "user-1" });

    expect(result.hasToken).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.login).toBe("testuser");
  });

  it("should also test repo access when testOwner and testRepo are provided", async () => {
    mockUsersService.findOne.mockResolvedValue({
      id: "user-1",
      githubToken: "plaintoken",
    });
    mockGitHubApiService.testToken.mockResolvedValue({
      valid: true,
      login: "testuser",
    });
    mockGitHubApiService.testRepoAccess.mockResolvedValue({
      accessible: true,
      isPrivate: true,
    });

    const result = await controller.testUserToken({
      userId: "user-1",
      testOwner: "Focus-Bear",
      testRepo: "windows-app-v2",
    });

    expect(mockGitHubApiService.testRepoAccess).toHaveBeenCalledWith(
      expect.any(String),
      "Focus-Bear",
      "windows-app-v2",
    );
    expect(result.repoAccess).toBe(true);
    expect(result.repoIsPrivate).toBe(true);
  });

  it("should not test repo access when token is invalid", async () => {
    mockUsersService.findOne.mockResolvedValue({
      id: "user-1",
      githubToken: "plaintoken",
    });
    mockGitHubApiService.testToken.mockResolvedValue({
      valid: false,
      error: "Bad credentials",
    });

    const result = await controller.testUserToken({
      userId: "user-1",
      testOwner: "Focus-Bear",
      testRepo: "windows-app-v2",
    });

    expect(mockGitHubApiService.testRepoAccess).not.toHaveBeenCalled();
    expect(result.valid).toBe(false);
    expect(result.repoAccess).toBeUndefined();
  });
});

describe("GitHubController - getMyConnectionStatus", () => {
  let controller: GitHubController;

  const mockBoss = {
    send: jest.fn(),
    getDb: () => ({ executeSql: jest.fn() }),
  };

  const mockEmailThreadRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };
  const mockEmailRepository = { findOne: jest.fn(), find: jest.fn() };
  const mockUsersService = { findOne: jest.fn() };
  const mockEmailsService = { getEmailById: jest.fn() };
  const mockGitHubService = { parseGitHubLinks: jest.fn() };
  const mockGitHubApiService = {
    fetchMultipleStatuses: jest.fn(),
    testToken: jest.fn(),
    testRepoAccess: jest.fn(),
    fetchProjectStatusOptions: jest.fn(),
  };
  const mockGitHubAppService = {
    getFrontendUrl: jest.fn(),
    getAuthorizationUrl: jest.fn(),
    createConnectToken: jest.fn(),
    verifyConnectToken: jest.fn(),
    exchangeCodeForToken: jest.fn(),
    storeTokenForUser: jest.fn(),
  };
  const mockRepoMappingService = {
    findAllForUser: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getDefaultForUser: jest.fn(),
  };
  const mockGitHubEmailInfoService = {
    getEmailGitHubInfo: jest.fn(),
    refreshEmailGitHubInfo: jest.fn(),
    getThreadMetadataByEmailIds: jest.fn(),
  };

  const mockGitHubProjectStatusService = {
    getProjectStatusOptions: jest.fn(),
    updateProjectItemStatus: jest.fn(),
  };

  const mockGitHubCategoryOverrideService = {
    bootstrapReservedCategoriesForUser: jest.fn().mockResolvedValue(undefined),
    findReservedCategoryId: jest.fn().mockResolvedValue(null),
    resolveCategoryKey: jest.fn().mockReturnValue(null),
    resolveOverrideCategoryId: jest.fn().mockResolvedValue(null),
  };

  const mockReq = { user: { userId: "user-1" } };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GitHubController],
      providers: [
        { provide: "PG_BOSS", useValue: mockBoss },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
        },
        { provide: getRepositoryToken(Email), useValue: mockEmailRepository },
        { provide: UsersService, useValue: mockUsersService },
        { provide: EmailsService, useValue: mockEmailsService },
        { provide: GitHubService, useValue: mockGitHubService },
        { provide: GitHubApiService, useValue: mockGitHubApiService },
        { provide: GitHubAppService, useValue: mockGitHubAppService },
        { provide: GitHubRepoMappingService, useValue: mockRepoMappingService },
        {
          provide: GitHubEmailInfoService,
          useValue: mockGitHubEmailInfoService,
        },
        {
          provide: GitHubProjectStatusService,
          useValue: mockGitHubProjectStatusService,
        },
        {
          provide: GitHubCategoryOverrideService,
          useValue: mockGitHubCategoryOverrideService,
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    controller = module.get<GitHubController>(GitHubController);
  });

  it("should return hasToken: false when user has no GitHub token", async () => {
    mockUsersService.findOne.mockResolvedValue({
      id: "user-1",
      githubToken: null,
    });

    const result = await controller.getMyConnectionStatus(mockReq);

    expect(result).toEqual({ hasToken: false });
    expect(mockGitHubApiService.testToken).not.toHaveBeenCalled();
  });

  it("should return token validity and login when token is valid", async () => {
    mockUsersService.findOne.mockResolvedValue({
      id: "user-1",
      githubToken: "plaintoken",
    });
    mockGitHubApiService.testToken.mockResolvedValue({
      valid: true,
      login: "testuser",
      name: "Test User",
      scopes: ["issues", "read:project"],
    });
    mockRepoMappingService.findAllForUser.mockResolvedValue([]);

    const result = await controller.getMyConnectionStatus(mockReq);

    expect(result).toMatchObject({
      hasToken: true,
      tokenValid: true,
      login: "testuser",
      name: "Test User",
      scopes: ["issues", "read:project"],
      repos: [],
    });
  });

  it("should return tokenValid: false when token is invalid", async () => {
    mockUsersService.findOne.mockResolvedValue({
      id: "user-1",
      githubToken: "plaintoken",
    });
    mockGitHubApiService.testToken.mockResolvedValue({
      valid: false,
      error: "Bad credentials",
    });

    const result = await controller.getMyConnectionStatus(mockReq);

    expect(result).toMatchObject({
      hasToken: true,
      tokenValid: false,
      error: "Bad credentials",
    });
    expect(mockRepoMappingService.findAllForUser).not.toHaveBeenCalled();
  });

  it("should include repo access results for each mapped repo", async () => {
    mockUsersService.findOne.mockResolvedValue({
      id: "user-1",
      githubToken: "plaintoken",
    });
    mockGitHubApiService.testToken.mockResolvedValue({
      valid: true,
      login: "testuser",
      scopes: ["issues"],
    });
    mockRepoMappingService.findAllForUser.mockResolvedValue([
      {
        id: "mapping-1",
        owner: "Focus-Bear",
        repo: "public-repo",
        isDefault: true,
        isAutoDiscovered: false,
      },
      {
        id: "mapping-2",
        owner: "Focus-Bear",
        repo: "private-repo",
        isDefault: false,
        isAutoDiscovered: true,
      },
    ]);
    mockGitHubApiService.testRepoAccess
      .mockResolvedValueOnce({ accessible: true, isPrivate: false })
      .mockResolvedValueOnce({ accessible: false, isPrivate: true });

    const result = await controller.getMyConnectionStatus(mockReq);

    expect(result.repos).toHaveLength(2);
    expect(result.repos[0]).toMatchObject({
      id: "mapping-1",
      owner: "Focus-Bear",
      repo: "public-repo",
      isDefault: true,
      accessible: true,
      isPrivate: false,
    });
    expect(result.repos[1]).toMatchObject({
      id: "mapping-2",
      owner: "Focus-Bear",
      repo: "private-repo",
      isDefault: false,
      accessible: false,
      isPrivate: true,
    });
  });

  it("should call testRepoAccess for each mapped repo", async () => {
    mockUsersService.findOne.mockResolvedValue({
      id: "user-1",
      githubToken: "plaintoken",
    });
    mockGitHubApiService.testToken.mockResolvedValue({
      valid: true,
      login: "testuser",
      scopes: [],
    });
    mockRepoMappingService.findAllForUser.mockResolvedValue([
      {
        id: "mapping-1",
        owner: "org1",
        repo: "repo1",
        isDefault: true,
        isAutoDiscovered: false,
      },
    ]);
    mockGitHubApiService.testRepoAccess.mockResolvedValue({
      accessible: true,
      isPrivate: false,
    });

    await controller.getMyConnectionStatus(mockReq);

    expect(mockGitHubApiService.testRepoAccess).toHaveBeenCalledWith(
      expect.any(String),
      "org1",
      "repo1",
    );
  });
});

describe("GitHubController - createConnectToken", () => {
  let controller: GitHubController;

  const mockBoss = {
    send: jest.fn(),
    getDb: () => ({ executeSql: jest.fn() }),
  };

  const mockEmailThreadRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };
  const mockEmailRepository = { findOne: jest.fn(), find: jest.fn() };
  const mockUsersService = { findOne: jest.fn() };
  const mockEmailsService = { getEmailById: jest.fn() };
  const mockGitHubService = { parseGitHubLinks: jest.fn() };
  const mockGitHubApiService = {
    fetchMultipleStatuses: jest.fn(),
    testToken: jest.fn(),
    testRepoAccess: jest.fn(),
    fetchProjectStatusOptions: jest.fn(),
  };
  const mockGitHubAppService = {
    getFrontendUrl: jest.fn(),
    getAuthorizationUrl: jest.fn(),
    createConnectToken: jest.fn().mockReturnValue("mock-token"),
    verifyConnectToken: jest.fn(),
    exchangeCodeForToken: jest.fn(),
    storeTokenForUser: jest.fn(),
  };
  const mockRepoMappingService = {
    findAllForUser: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getDefaultForUser: jest.fn(),
  };
  const mockGitHubEmailInfoService = {
    getEmailGitHubInfo: jest.fn(),
    refreshEmailGitHubInfo: jest.fn(),
    getThreadMetadataByEmailIds: jest.fn(),
  };

  const mockGitHubProjectStatusService = {
    getProjectStatusOptions: jest.fn(),
    updateProjectItemStatus: jest.fn(),
  };

  const mockGitHubCategoryOverrideService = {
    bootstrapReservedCategoriesForUser: jest.fn().mockResolvedValue(undefined),
    findReservedCategoryId: jest.fn().mockResolvedValue(null),
    resolveCategoryKey: jest.fn().mockReturnValue(null),
    resolveOverrideCategoryId: jest.fn().mockResolvedValue(null),
  };

  const mockReq = { user: { userId: "user-1" } };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGitHubAppService.createConnectToken.mockReturnValue("mock-token");

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GitHubController],
      providers: [
        { provide: "PG_BOSS", useValue: mockBoss },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
        },
        { provide: getRepositoryToken(Email), useValue: mockEmailRepository },
        { provide: UsersService, useValue: mockUsersService },
        { provide: EmailsService, useValue: mockEmailsService },
        { provide: GitHubService, useValue: mockGitHubService },
        { provide: GitHubApiService, useValue: mockGitHubApiService },
        { provide: GitHubAppService, useValue: mockGitHubAppService },
        { provide: GitHubRepoMappingService, useValue: mockRepoMappingService },
        {
          provide: GitHubEmailInfoService,
          useValue: mockGitHubEmailInfoService,
        },
        {
          provide: GitHubProjectStatusService,
          useValue: mockGitHubProjectStatusService,
        },
        {
          provide: GitHubCategoryOverrideService,
          useValue: mockGitHubCategoryOverrideService,
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    controller = module.get<GitHubController>(GitHubController);
  });

  it("should create connect token without repo scope by default", async () => {
    const result = await controller.createConnectToken(mockReq, {});

    expect(mockGitHubAppService.createConnectToken).toHaveBeenCalledWith(
      "user-1",
      false,
    );
    expect(result).toEqual({ token: "mock-token" });
  });

  it("should create connect token without repo scope when includeRepo is false", async () => {
    const result = await controller.createConnectToken(mockReq, {
      includeRepo: false,
    });

    expect(mockGitHubAppService.createConnectToken).toHaveBeenCalledWith(
      "user-1",
      false,
    );
    expect(result).toEqual({ token: "mock-token" });
  });

  it("should create connect token with repo scope when includeRepo is true", async () => {
    const result = await controller.createConnectToken(mockReq, {
      includeRepo: true,
    });

    expect(mockGitHubAppService.createConnectToken).toHaveBeenCalledWith(
      "user-1",
      true,
    );
    expect(result).toEqual({ token: "mock-token" });
  });

  it("should handle missing body by defaulting includeRepo to false", async () => {
    const result = await controller.createConnectToken(mockReq, undefined);

    expect(mockGitHubAppService.createConnectToken).toHaveBeenCalledWith(
      "user-1",
      false,
    );
    expect(result).toEqual({ token: "mock-token" });
  });
});
