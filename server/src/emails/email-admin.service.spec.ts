import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { INBOX_MODES } from "../constants/query-limits";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ContactsService } from "../contacts/contacts.service";
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
      mockEmailsService.getInbox = jest
        .fn()
        .mockResolvedValue({ emails: [] });

      const result = await service.queueBulkRecategorization("user-1");
      expect(result.queued).toBe(0);
      expect(result.batchId).toBeNull();
    });

    it("should queue follow-up emails when present", async () => {
      const mockBoss = { send: jest.fn().mockResolvedValue(undefined) };

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
});
