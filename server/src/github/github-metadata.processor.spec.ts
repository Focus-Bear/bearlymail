import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { UsersService } from "../users/users.service";
import { GitHubCategoryOverrideService } from "./github-category-override.service";
import { GitHubEmailInfoService } from "./github-email-info.service";
import { GitHubMetadataProcessor } from "./github-metadata.processor";
import { GitHubRepoMappingService } from "./github-repo-mapping.service";

describe("GitHubMetadataProcessor", () => {
  let processor: GitHubMetadataProcessor;
  let workHandler: (job: {
    data: { userId: string; emailId: string; threadId: string };
  }) => Promise<void>;

  const mockBoss = {
    work: jest.fn(),
  } as unknown as PgBoss;

  const mockGithubEmailInfoService = {
    processEmailGitHubMetadataForJob: jest.fn(),
  };

  const mockRepoMappingService = {
    autoDiscoverRepo: jest.fn(),
  };

  const mockCategoryOverrideService = {
    resolveOverride: jest.fn().mockResolvedValue({
      categoryId: null,
      matchedKey: null,
      applied: false,
      suppressedReason: null,
    }),
  };

  const mockUsersService = {
    findOne: jest.fn(),
  };

  const mockUserEncryptionService = {
    withUserKey: jest.fn(),
  };

  const mockEmailThreadRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    (mockBoss.work as jest.Mock).mockImplementation(
      async (_name: string, _opts: unknown, handler: typeof workHandler) => {
        workHandler = handler;
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitHubMetadataProcessor,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: mockBoss },
        {
          provide: GitHubEmailInfoService,
          useValue: mockGithubEmailInfoService,
        },
        { provide: GitHubRepoMappingService, useValue: mockRepoMappingService },
        {
          provide: GitHubCategoryOverrideService,
          useValue: mockCategoryOverrideService,
        },
        { provide: UsersService, useValue: mockUsersService },
        {
          provide: UserEncryptionService,
          useValue: mockUserEncryptionService,
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
        },
      ],
    }).compile();

    processor = module.get<GitHubMetadataProcessor>(GitHubMetadataProcessor);
    await processor.onModuleInit();
  });

  it("registers a worker for FETCH_GITHUB_METADATA", () => {
    expect(mockBoss.work).toHaveBeenCalledWith(
      JOB_NAMES.FETCH_GITHUB_METADATA,
      { batchSize: 1 },
      expect.any(Function),
    );
  });

  it("wraps processJob in userEncryptionService.withUserKey so the per-user KMS data key is in ALS when TypeORM hydrates encrypted email columns", async () => {
    // Track whether processEmailGitHubMetadataForJob is called INSIDE the
    // withUserKey wrapper. Without this wrapping, the worker uses the global
    // key and every encrypted column decrypt fails, tripping the circuit
    // breaker after 3 failures (see github-metadata.processor.ts comment).
    let processCalledInsideWrapper = false;
    mockUserEncryptionService.withUserKey.mockImplementation(
      async (_userId: string, task: () => Promise<void>) => {
        await task();
      },
    );
    mockGithubEmailInfoService.processEmailGitHubMetadataForJob.mockImplementation(
      () => {
        processCalledInsideWrapper =
          mockUserEncryptionService.withUserKey.mock.calls.length > 0;
        return null;
      },
    );

    await workHandler([
      {
        data: {
          userId: "user-1",
          emailId: "email-1",
          threadId: "thread-1",
        },
      },
    ]);

    expect(mockUserEncryptionService.withUserKey).toHaveBeenCalledWith(
      "user-1",
      expect.any(Function),
    );
    expect(processCalledInsideWrapper).toBe(true);
    expect(
      mockGithubEmailInfoService.processEmailGitHubMetadataForJob,
    ).toHaveBeenCalledWith("user-1", "email-1", "thread-1", false);
  });

  it("propagates job errors so PgBoss can retry", async () => {
    mockUserEncryptionService.withUserKey.mockImplementation(
      async (_userId: string, task: () => Promise<void>) => task(),
    );
    mockGithubEmailInfoService.processEmailGitHubMetadataForJob.mockRejectedValue(
      new Error("boom"),
    );

    await expect(
      workHandler([
        {
          data: {
            userId: "user-1",
            emailId: "email-1",
            threadId: "thread-1",
          },
        },
      ]),
    ).rejects.toThrow("boom");
  });
});
