import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { JOB_NAMES } from "../constants/job-names";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailBacklogService } from "./email-backlog.service";

describe("EmailBacklogService", () => {
  let service: EmailBacklogService;
  let threadRepo: jest.Mocked<Repository<EmailThread>>;
  let emailRepo: jest.Mocked<Repository<Email>>;
  let boss: { send: jest.Mock; count: jest.Mock };

  beforeEach(async () => {
    boss = { send: jest.fn().mockResolvedValue("job-id"), count: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailBacklogService,
        { provide: "PG_BOSS", useValue: boss },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: {
            find: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Email),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EmailBacklogService>(EmailBacklogService);
    threadRepo = module.get(getRepositoryToken(EmailThread));
    emailRepo = module.get(getRepositoryToken(Email));
  });

  /** Helper to build a chainable createQueryBuilder mock that resolves with rows. */
  function mockQb(rows: Array<{ id: string; threadId: string }>) {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    };
    (emailRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
    return qb;
  }

  describe("queueBacklogProcessing", () => {
    it("returns zero count when no deferred threads", async () => {
      threadRepo.find.mockResolvedValue([]);
      const result = await service.queueBacklogProcessing("user-1");
      expect(result).toEqual({ threadCount: 0 });
      expect(boss.send).not.toHaveBeenCalled();
    });

    it("queues priority batch and per-thread summaries for deferred threads", async () => {
      const threads = [{ id: "thread-1" }, { id: "thread-2" }] as EmailThread[];
      threadRepo.find.mockResolvedValue(threads);
      mockQb([
        { id: "email-1", threadId: "thread-1" },
        { id: "email-2", threadId: "thread-2" },
      ]);

      const result = await service.queueBacklogProcessing("user-1");

      expect(result).toEqual({ threadCount: 2 });

      // Priority batch queued once
      expect(boss.send).toHaveBeenCalledWith(
        JOB_NAMES.REFINE_PRIORITY_BATCH,
        expect.objectContaining({
          userId: "user-1",
          threadIds: ["thread-1", "thread-2"],
          isBacklogProcessing: true,
        }),
        expect.objectContaining({
          singletonKey: "backlog-priority-user-1",
        }),
      );

      // Summary queued per thread
      expect(boss.send).toHaveBeenCalledWith(
        JOB_NAMES.GENERATE_SUMMARY,
        expect.objectContaining({
          userId: "user-1",
          threadId: "thread-1",
          emailId: "email-1",
          isBacklogProcessing: true,
        }),
        expect.objectContaining({
          singletonKey: "backlog-summary-thread-1",
        }),
      );

      expect(boss.send).toHaveBeenCalledWith(
        JOB_NAMES.GENERATE_SUMMARY,
        expect.objectContaining({
          threadId: "thread-2",
          emailId: "email-2",
        }),
        expect.any(Object),
      );
    });

    it("skips summary for threads with no emails", async () => {
      threadRepo.find.mockResolvedValue([{ id: "thread-1" }] as EmailThread[]);
      // batch query returns nothing for this thread
      mockQb([]);

      const result = await service.queueBacklogProcessing("user-1");

      expect(result).toEqual({ threadCount: 1 });
      // Only priority batch, no summary
      expect(boss.send).toHaveBeenCalledTimes(1);
      expect(boss.send).toHaveBeenCalledWith(
        JOB_NAMES.REFINE_PRIORITY_BATCH,
        expect.any(Object),
        expect.any(Object),
      );
    });

    it("double-quotes camelCase identifiers in the latest-email subquery", async () => {
      threadRepo.find.mockResolvedValue([{ id: "thread-1" }] as EmailThread[]);
      const qb = mockQb([{ id: "email-1", threadId: "thread-1" }]);

      await service.queueBacklogProcessing("user-1");

      // The ad-hoc `e2` subquery alias is not rewritten by TypeORM, so its
      // camelCase columns must be explicitly double-quoted — otherwise Postgres
      // folds them to lowercase and throws `column e2.receivedat does not exist`.
      const rawWhere = (qb.andWhere as jest.Mock).mock.calls
        .map((args) => String(args[0]))
        .join("\n");
      expect(rawWhere).toContain('e2."receivedAt"');
      expect(rawWhere).toContain('e2."emailThreadId"');
    });
  });

  describe("getBacklogProgress", () => {
    it("returns isProcessing true when deferred threads exist", async () => {
      threadRepo.count.mockResolvedValue(5);
      const result = await service.getBacklogProgress("user-1");
      expect(result).toEqual({ remaining: 5, isProcessing: true });
    });

    it("returns isProcessing false when no deferred threads remain", async () => {
      threadRepo.count.mockResolvedValue(0);
      const result = await service.getBacklogProgress("user-1");
      expect(result).toEqual({ remaining: 0, isProcessing: false });
    });
  });
});
