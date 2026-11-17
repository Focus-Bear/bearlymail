import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  buildOlderThanQuery,
  IMPORT_OLDER_BATCH_SIZE,
  IMPORT_OLDER_STATUS,
  ImportOlderEmailsService,
  pickNewThreadIds,
} from "./import-older-emails.service";
import { GmailProvider } from "./providers/gmail.provider";
import { GmailSyncService } from "./providers/gmail-sync.service";

// The providers drag in every sync dependency; this unit test only needs their shape.
jest.mock("./providers/gmail.provider", () => ({ GmailProvider: class {} }));
jest.mock("./providers/gmail-sync.service", () => ({
  GmailSyncService: class {},
}));

const USER_ID = "user-1";
const OLDEST_ACTIVITY = new Date("2026-10-01T00:00:00.000Z");
const OLDEST_ACTIVITY_EPOCH_SECONDS = 1790812800;

describe("buildOlderThanQuery", () => {
  it("lists inbox mail older than the cursor in epoch seconds", () => {
    expect(buildOlderThanQuery(OLDEST_ACTIVITY)).toContain(`in:inbox`);
    expect(buildOlderThanQuery(OLDEST_ACTIVITY)).toContain(
      `before:${OLDEST_ACTIVITY_EPOCH_SECONDS}`,
    );
  });
});

describe("pickNewThreadIds", () => {
  it("drops threads already imported and keeps Gmail's newest-first order", () => {
    expect(pickNewThreadIds(["a", "b", "c"], new Set(["b"]))).toEqual([
      "a",
      "c",
    ]);
  });

  it("caps one click at a single batch", () => {
    const listed = Array.from(
      { length: IMPORT_OLDER_BATCH_SIZE + 1 },
      (_unused, index) => `t${index}`,
    );
    expect(pickNewThreadIds(listed, new Set())).toHaveLength(
      IMPORT_OLDER_BATCH_SIZE,
    );
  });
});

describe("ImportOlderEmailsService", () => {
  let service: ImportOlderEmailsService;
  let boss: { send: jest.Mock };
  let threadRepo: jest.Mocked<Repository<EmailThread>>;
  let gmailProvider: { createGmailClientPublic: jest.Mock };
  let gmailSyncService: { fetchAllThreadsWithPagination: jest.Mock };
  let oldestRow: { latest: Date | null } | undefined;

  beforeEach(async () => {
    boss = { send: jest.fn().mockResolvedValue("job-id") };
    gmailProvider = {
      createGmailClientPublic: jest.fn().mockResolvedValue({}),
    };
    gmailSyncService = {
      fetchAllThreadsWithPagination: jest.fn().mockResolvedValue({
        threadIds: ["old-1", "known", "old-2"],
        hasMore: false,
      }),
    };
    oldestRow = { latest: OLDEST_ACTIVITY };
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockImplementation(async () => oldestRow),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportOlderEmailsService,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: boss },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: {
            find: jest.fn().mockResolvedValue([{ threadId: "known" }]),
          },
        },
        {
          provide: getRepositoryToken(Email),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
          },
        },
        { provide: GmailProvider, useValue: gmailProvider },
        { provide: GmailSyncService, useValue: gmailSyncService },
      ],
    }).compile();

    service = module.get(ImportOlderEmailsService);
    threadRepo = module.get(getRepositoryToken(EmailThread));
  });

  it("queues the unseen older threads as a backfill continuation job", async () => {
    const result = await service.importNextBatch(USER_ID);

    expect(gmailSyncService.fetchAllThreadsWithPagination).toHaveBeenCalledWith(
      {},
      buildOlderThanQuery(OLDEST_ACTIVITY),
      expect.any(Number),
    );
    expect(boss.send).toHaveBeenCalledWith(
      JOB_NAMES.FETCH_USER_EMAILS,
      {
        userId: USER_ID,
        threadIds: ["old-1", "old-2"],
        isContinuation: true,
        isBackfill: true,
      },
      expect.objectContaining({
        singletonKey: expect.stringContaining(USER_ID),
      }),
    );
    expect(result).toEqual({
      status: IMPORT_OLDER_STATUS.QUEUED,
      queuedThreads: 2,
    });
  });

  it("reports nothing older when every listed thread is already imported", async () => {
    threadRepo.find.mockResolvedValue([
      { threadId: "old-1" },
      { threadId: "known" },
      { threadId: "old-2" },
    ] as EmailThread[]);

    const result = await service.importNextBatch(USER_ID);

    expect(boss.send).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: IMPORT_OLDER_STATUS.NOTHING_OLDER,
      queuedThreads: 0,
    });
  });

  it("reports nothing older for a user with no mail yet", async () => {
    oldestRow = undefined;

    const result = await service.importNextBatch(USER_ID);

    expect(
      gmailSyncService.fetchAllThreadsWithPagination,
    ).not.toHaveBeenCalled();
    expect(result.status).toBe(IMPORT_OLDER_STATUS.NOTHING_OLDER);
  });

  it("is unsupported for accounts without a Gmail connection", async () => {
    gmailProvider.createGmailClientPublic.mockResolvedValue(null);

    const result = await service.importNextBatch(USER_ID);

    expect(boss.send).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: IMPORT_OLDER_STATUS.UNSUPPORTED,
      queuedThreads: 0,
    });
  });
});
