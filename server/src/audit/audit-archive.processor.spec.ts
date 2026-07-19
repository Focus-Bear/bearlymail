import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { AuditLog } from "../database/entities/audit-log.entity";
import { AuditArchiveProcessor } from "./audit-archive.processor";

const mockS3Send = jest.fn().mockResolvedValue(undefined);
jest.mock("@aws-sdk/client-s3", () => {
  const actual = jest.requireActual("@aws-sdk/client-s3");
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockS3Send,
    })),
  };
});

describe("AuditArchiveProcessor", () => {
  let processor: AuditArchiveProcessor;
  let getRawMany: jest.Mock;
  let repo: { createQueryBuilder: jest.Mock; delete: jest.Mock };
  let boss: { schedule: jest.Mock; work: jest.Mock };

  beforeEach(async () => {
    mockS3Send.mockClear();
    // runArchive() now uses getRawMany() (not .find()) so TypeORM does not run
    // the column transformers — encrypted columns are archived as raw ciphertext.
    getRawMany = jest.fn();
    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany,
    };
    repo = {
      createQueryBuilder: jest.fn(() => qb),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    boss = { schedule: jest.fn(), work: jest.fn() };

    const config = {
      get: (key: string) => {
        if (key === "AUDIT_LOG_ARCHIVE_BUCKET") return "test-bucket";
        if (key === "AWS_REGION") return "ap-southeast-2";
        return undefined;
      },
    } as unknown as ConfigService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditArchiveProcessor,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: boss },
        { provide: getRepositoryToken(AuditLog), useValue: repo },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    processor = module.get(AuditArchiveProcessor);
  });

  it("uploads a batch to S3, then deletes the rows from Postgres", async () => {
    const row: AuditLog = {
      id: "row-1",
      userId: "user-1",
      action: "GET /admin/x",
      targetType: null,
      targetId: null,
      metadata: null,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date("2025-01-15T10:00:00Z"),
    };

    getRawMany.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);

    const result = await processor.runArchive();

    expect(mockS3Send).toHaveBeenCalledTimes(1);
    const putCall = mockS3Send.mock.calls[0][0];
    expect(putCall.input.Bucket).toBe("test-bucket");
    expect(putCall.input.Key).toMatch(
      /^audit-logs\/2025\/01\/15\/exported-.+\.ndjson$/,
    );
    expect(putCall.input.ContentType).toBe("application/x-ndjson");
    expect(putCall.input.Body).toBe(
      JSON.stringify({
        id: "row-1",
        userId: "user-1",
        action: "GET /admin/x",
        targetType: null,
        targetId: null,
        metadata: null,
        ipAddress: null,
        userAgent: null,
        createdAt: "2025-01-15T10:00:00.000Z",
      }),
    );

    expect(repo.delete).toHaveBeenCalledWith(["row-1"]);
    expect(result).toEqual({ batches: 1, rowsArchived: 1 });
  });

  it("does nothing when AUDIT_LOG_ARCHIVE_BUCKET is not configured", async () => {
    const noBucketConfig = {
      get: (key: string) =>
        key === "AUDIT_LOG_ARCHIVE_BUCKET" ? undefined : undefined,
    } as unknown as ConfigService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditArchiveProcessor,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: boss },
        { provide: getRepositoryToken(AuditLog), useValue: repo },
        { provide: ConfigService, useValue: noBucketConfig },
      ],
    }).compile();

    const localProcessor = module.get(AuditArchiveProcessor);

    // Override the env-var fallback so the test environment can't leak a bucket name in.
    const originalEnv = process.env.AUDIT_LOG_ARCHIVE_BUCKET;
    delete process.env.AUDIT_LOG_ARCHIVE_BUCKET;

    try {
      const result = await localProcessor.runArchive();
      expect(result).toEqual({ batches: 0, rowsArchived: 0 });
      expect(mockS3Send).not.toHaveBeenCalled();
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
      expect(repo.delete).not.toHaveBeenCalled();
    } finally {
      if (originalEnv !== undefined) {
        process.env.AUDIT_LOG_ARCHIVE_BUCKET = originalEnv;
      }
    }
  });

  it("does not delete rows from Postgres if the S3 upload fails", async () => {
    const row: AuditLog = {
      id: "row-1",
      userId: "user-1",
      action: "GET /admin/x",
      targetType: null,
      targetId: null,
      metadata: null,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date("2025-01-15T10:00:00Z"),
    };

    getRawMany.mockResolvedValueOnce([row]);
    mockS3Send.mockRejectedValueOnce(new Error("s3 down"));

    await expect(processor.runArchive()).rejects.toThrow("s3 down");
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("registers the daily cron and worker on module init", async () => {
    await processor.onModuleInit();

    expect(boss.schedule).toHaveBeenCalledWith(
      "audit-log-archive",
      "30 3 * * *",
    );
    expect(boss.work).toHaveBeenCalledWith(
      "audit-log-archive",
      { batchSize: 1 },
      expect.any(Function),
    );
  });
});
