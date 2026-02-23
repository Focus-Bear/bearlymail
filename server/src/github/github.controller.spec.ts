import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { GitHubController } from "./github.controller";
import { GitHubService } from "./github.service";
import { GitHubApiService } from "./github-api.service";
import { GitHubAppService } from "./github-app.service";
import { GitHubRepoMappingService } from "./github-repo-mapping.service";
import { UsersService } from "../users/users.service";
import { EmailsService } from "../emails/emails.service";
import { EmailThread } from "../database/entities/email-thread.entity";
import { Email } from "../database/entities/email.entity";

describe("GitHubController - getAdminDebugInfo", () => {
  let controller: GitHubController;

  const mockExecuteSql = jest.fn();
  const mockBoss = {
    send: jest.fn(),
    db: {
      executeSql: mockExecuteSql,
    },
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
      ],
    }).compile();

    controller = module.get<GitHubController>(GitHubController);
  });

  it("should return debug info with correct structure", async () => {
    // Mock users with token query
    mockExecuteSql
      .mockResolvedValueOnce({ rows: [{ count: "3" }] }) // users with token
      .mockResolvedValueOnce({ rows: [{ count: "42" }] }) // threads with metadata
      .mockResolvedValueOnce({
        // job stats
        rows: [
          { state: "failed", count: "2" },
          { state: "active", count: "1" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // recent failed jobs
      .mockResolvedValueOnce({ rows: [{ completedCount: "150" }] }); // archive stats

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
    });
    expect(result.timestamp).toBeDefined();
  });

  it("should include failed job details in recentFailedJobs", async () => {
    const mockFailedJob = {
      id: "job-uuid-1234-5678",
      data: { userId: "user-1", emailId: "email-1", threadId: "thread-1" },
      output: { message: "GitHub token is invalid or expired" },
      createdon: "2026-02-20T10:00:00Z",
      completedon: null,
      retrylimit: 3,
      retrycount: 3,
    };

    mockExecuteSql
      .mockResolvedValueOnce({ rows: [{ count: "1" }] }) // users with token
      .mockResolvedValueOnce({ rows: [{ count: "10" }] }) // threads with metadata
      .mockResolvedValueOnce({ rows: [{ state: "failed", count: "1" }] }) // job stats
      .mockResolvedValueOnce({ rows: [mockFailedJob] }) // recent failed jobs
      .mockResolvedValueOnce({ rows: [{ completedCount: "5" }] }); // archive stats

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
    mockExecuteSql
      .mockResolvedValueOnce({ rows: [] }) // no users with token
      .mockResolvedValueOnce({ rows: [] }) // no threads with metadata
      .mockResolvedValueOnce({ rows: [] }) // no job stats
      .mockResolvedValueOnce({ rows: [] }) // no failed jobs
      .mockResolvedValueOnce({ rows: [] }); // no archive stats

    const result = await controller.getAdminDebugInfo();

    expect(result.usersWithToken).toBe(0);
    expect(result.threadsWithMetadata).toBe(0);
    expect(result.jobStats.completed).toBe(0);
    expect(result.recentFailedJobs).toEqual([]);
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

    mockExecuteSql
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      .mockResolvedValueOnce({ rows: [{ state: "failed", count: "1" }] })
      .mockResolvedValueOnce({ rows: [mockFailedJob] })
      .mockResolvedValueOnce({ rows: [{ completedCount: "3" }] });

    const result = await controller.getAdminDebugInfo();

    expect(result.recentFailedJobs[0].error).toBe("Unknown error");
  });

  it("should count all job states from the stats query", async () => {
    mockExecuteSql
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ count: "10" }] })
      .mockResolvedValueOnce({
        rows: [
          { state: "created", count: "5" },
          { state: "active", count: "2" },
          { state: "retry", count: "1" },
          { state: "failed", count: "3" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ completedCount: "100" }] });

    const result = await controller.getAdminDebugInfo();

    expect(result.jobStats).toMatchObject({
      created: 5,
      active: 2,
      retry: 1,
      failed: 3,
      completed: 100,
    });
  });
});
