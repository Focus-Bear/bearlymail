import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { INBOX_MODES } from "../constants/query-limits";
import { ContactsService } from "../contacts/contacts.service";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailAdminService } from "./email-admin.service";
import { EmailsService } from "./emails.service";

describe("EmailAdminService", () => {
  let service: EmailAdminService;
  let mockEmailsService: jest.Mocked<Partial<EmailsService>>;

  beforeEach(async () => {
    mockEmailsService = {
      getInbox: jest.fn().mockResolvedValue({ emails: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailAdminService,
        { provide: "PG_BOSS", useValue: { send: jest.fn() } },
        { provide: EmailsService, useValue: mockEmailsService },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue({
              innerJoin: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              addGroupBy: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getRawMany: jest.fn().mockResolvedValue([]),
            }),
          } as unknown as Repository<EmailThread>,
        },
        {
          provide: BlockedSendersService,
          useValue: {},
        },
        {
          provide: ContactsService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<EmailAdminService>(EmailAdminService);
  });

  describe("parseModes", () => {
    it("should return all three valid modes when no param given", () => {
      const result = service.parseModes(undefined);
      expect(result).toContain(INBOX_MODES.TRIAGE);
      expect(result).toContain(INBOX_MODES.ACTION);
      expect(result).toContain(INBOX_MODES.FOLLOW_UP);
      expect(result).toHaveLength(3);
    });

    it("should return follow-up when explicitly requested", () => {
      const result = service.parseModes("follow-up");
      expect(result).toEqual([INBOX_MODES.FOLLOW_UP]);
    });

    it("should return triage and follow-up when both requested", () => {
      const result = service.parseModes("triage,follow-up");
      expect(result).toContain(INBOX_MODES.TRIAGE);
      expect(result).toContain(INBOX_MODES.FOLLOW_UP);
      expect(result).toHaveLength(2);
    });

    it("should fall back to all valid modes for unknown param", () => {
      const result = service.parseModes("unknown");
      expect(result).toHaveLength(3);
      expect(result).toContain(INBOX_MODES.FOLLOW_UP);
    });
  });

  describe("queueBulkRecategorization", () => {
    it("should return queued: 0 and batchId: null when no emails exist", async () => {
      mockEmailsService.getInbox = jest.fn().mockResolvedValue({ emails: [] });

      const result = await service.queueBulkRecategorization("user-1");
      expect(result.queued).toBe(0);
      expect(result.batchId).toBeNull();
    });

    it("should queue follow-up emails when present", async () => {
      const mockBoss = {
        send: jest.fn().mockResolvedValue("mock-pgboss-job-id"),
      };

      // Re-create with boss that we can check
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailAdminService,
          { provide: "PG_BOSS", useValue: mockBoss },
          {
            provide: EmailsService,
            useValue: {
              getInbox: jest.fn().mockImplementation((_userId, _raw, mode) => {
                if (mode === INBOX_MODES.FOLLOW_UP) {
                  return Promise.resolve({
                    emails: [{ id: "email-follow-up-1" }],
                  });
                }
                return Promise.resolve({ emails: [] });
              }),
            },
          },
          {
            provide: getRepositoryToken(EmailThread),
            useValue: {
              createQueryBuilder: jest.fn().mockReturnValue({
                innerJoin: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                addSelect: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                groupBy: jest.fn().mockReturnThis(),
                addGroupBy: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                getRawMany: jest.fn().mockResolvedValue([]),
              }),
            } as unknown as Repository<EmailThread>,
          },
          { provide: BlockedSendersService, useValue: {} },
          { provide: ContactsService, useValue: {} },
        ],
      }).compile();

      const svc = module.get<EmailAdminService>(EmailAdminService);
      const result = await svc.queueBulkRecategorization("user-1");

      expect(result.queued).toBe(1);
      expect(result.batchId).not.toBeNull();
      expect(mockBoss.send).toHaveBeenCalledWith(
        "refine-priority",
        expect.objectContaining({ emailId: "email-follow-up-1" }),
        expect.any(Object),
      );
    });
  });

  describe("getRecategorizationProgress", () => {
    // Regression guard for the pg-boss v11 upgrade: the db handle is only
    // reachable via boss.getDb(); the old public `boss.db` property is gone.
    // This boss mock deliberately exposes getDb() and NO `db` property, which
    // is exactly the prod shape that made the progress endpoint 500 on every
    // poll (TypeError: Cannot read properties of undefined reading executeSql),
    // freezing the bar at "0 of N emails processed".
    const buildServiceWithBoss = async (
      executeSql: jest.Mock,
    ): Promise<EmailAdminService> => {
      const mockBoss = { send: jest.fn(), getDb: () => ({ executeSql }) };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailAdminService,
          { provide: "PG_BOSS", useValue: mockBoss },
          { provide: EmailsService, useValue: { getInbox: jest.fn() } },
          {
            provide: getRepositoryToken(EmailThread),
            useValue: {} as unknown as Repository<EmailThread>,
          },
          { provide: BlockedSendersService, useValue: {} },
          { provide: ContactsService, useValue: {} },
        ],
      }).compile();
      return module.get<EmailAdminService>(EmailAdminService);
    };

    it("returns zeroed counts without querying when batchId is empty", async () => {
      const executeSql = jest.fn();
      const svc = await buildServiceWithBoss(executeSql);

      const result = await svc.getRecategorizationProgress("user-1", "");

      expect(result).toEqual({
        total: 0,
        completed: 0,
        failed: 0,
        pending: 0,
      });
      expect(executeSql).not.toHaveBeenCalled();
    });

    it("aggregates pg-boss job states via getDb() (no reliance on boss.db)", async () => {
      // First call probes for pgboss.archive (v11 dropped it → returns null);
      // second call is the actual progress aggregation over pgboss.job.
      const executeSql = jest.fn().mockImplementation((sql: string) =>
        sql.includes("to_regclass")
          ? Promise.resolve({ rows: [{ t: null }] })
          : Promise.resolve({
              rows: [
                { state: "completed", count: "3" },
                { state: "created", count: "2" },
                { state: "active", count: "1" },
                { state: "failed", count: "1" },
              ],
            }),
      );
      const svc = await buildServiceWithBoss(executeSql);

      const result = await svc.getRecategorizationProgress(
        "user-1",
        "batch-123",
      );

      // completed=3, failed=1, pending=created(2)+active(1)=3, total=7
      expect(result).toEqual({
        total: 7,
        completed: 3,
        failed: 1,
        pending: 3,
      });
      // The progress query (not the archive probe) carries the params, and it
      // must NOT reference pgboss.archive when that table is absent (the v11 bug).
      const progressCall = executeSql.mock.calls.find((call) => call[1]);
      expect(progressCall?.[1]).toEqual([
        "batch-123",
        "user-1",
        "refine-priority",
      ]);
      expect(progressCall?.[0]).not.toContain("pgboss.archive");
    });
  });
});
