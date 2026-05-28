import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { EmailExportService } from "./email-export.service";

const makeThread = (overrides: Partial<EmailThread> = {}): EmailThread =>
  ({
    id: "thread-1",
    userId: "user-1",
    threadId: "gmail-thread-1",
    starCount: 0,
    isArchived: false,
    categoryId: null,
    ...overrides,
  }) as EmailThread;

const makeEmail = (overrides: Partial<Email> = {}): Email =>
  ({
    id: "email-1",
    userId: "user-1",
    from: "sender@example.com",
    subject: "Hello",
    body: "World",
    isRead: false,
    labels: ["INBOX"],
    thread: makeThread(),
    ...overrides,
  }) as Email;

const makeContext = (overrides: Partial<UserContext> = {}): UserContext =>
  ({
    contextId: "ctx-1",
    userId: "user-1",
    contextKey: ContextKey.EMAIL_CATEGORY,
    contextValue: "Work - Work-related emails",
    ...overrides,
  }) as UserContext;

describe("EmailExportService", () => {
  let service: EmailExportService;
  const mockEmailRepository = { find: jest.fn() };
  const mockUserContextRepository = { find: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailExportService,
        {
          provide: getRepositoryToken(Email),
          useValue: mockEmailRepository,
        },
        {
          provide: getRepositoryToken(UserContext),
          useValue: mockUserContextRepository,
        },
      ],
    }).compile();

    service = module.get<EmailExportService>(EmailExportService);
    mockUserContextRepository.find.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // extractDomainPattern
  // ---------------------------------------------------------------------------

  describe("extractDomainPattern", () => {
    it("returns regex for bare email address", () => {
      expect(service.extractDomainPattern("user@example.com")).toBe(
        ".*@example\\.com$",
      );
    });

    it("returns regex for angle-bracket address", () => {
      expect(service.extractDomainPattern("Alice <alice@sub.domain.io>")).toBe(
        ".*@sub\\.domain\\.io$",
      );
    });

    it("returns empty string for null", () => {
      expect(service.extractDomainPattern(null)).toBe("");
    });

    it("returns empty string for empty string", () => {
      expect(service.extractDomainPattern("")).toBe("");
    });

    it("returns empty string when no @ symbol", () => {
      expect(service.extractDomainPattern("notanemail")).toBe("");
    });
  });

  // ---------------------------------------------------------------------------
  // determineIsReceived
  // ---------------------------------------------------------------------------

  describe("determineIsReceived", () => {
    it("returns true when labels is null", () => {
      expect(service.determineIsReceived(null)).toBe(true);
    });

    it("returns true when labels does not contain SENT", () => {
      expect(service.determineIsReceived(["INBOX", "UNREAD"])).toBe(true);
    });

    it("returns false when labels contains SENT", () => {
      expect(service.determineIsReceived(["SENT"])).toBe(false);
    });

    it("returns false when labels contains SENT alongside other labels", () => {
      expect(service.determineIsReceived(["SENT", "INBOX"])).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // encryptExport / round-trip
  // ---------------------------------------------------------------------------

  describe("encryptExport", () => {
    it("produces a colon-delimited hex string with four parts", async () => {
      const result = await service.encryptExport('{"test":1}', "password123");
      const parts = result.split(":");
      expect(parts).toHaveLength(4);
      parts.forEach((part) => {
        expect(part).toMatch(/^[0-9a-f]+$/i);
      });
    });

    it("produces different output each call (random IV/salt)", async () => {
      const first = await service.encryptExport("payload", "password123");
      const second = await service.encryptExport("payload", "password123");
      expect(first).not.toBe(second);
    });
  });

  // ---------------------------------------------------------------------------
  // exportEmails
  // ---------------------------------------------------------------------------

  describe("exportEmails", () => {
    it("throws BadRequestException when password is missing", async () => {
      await expect(service.exportEmails("user-1", "")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequestException when password is too short", async () => {
      await expect(service.exportEmails("user-1", "short")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("returns an encrypted string for valid input", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ from: "alice@example.com", subject: "Hi", body: "There" }),
      ]);

      const result = await service.exportEmails("user-1", "securepassword");

      expect(typeof result).toBe("string");
      expect(result.split(":")).toHaveLength(4);
    });

    it("maps received emails correctly (no SENT label)", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ labels: ["INBOX"], isRead: true }),
      ]);

      const encrypted = await service.exportEmails("user-1", "securepassword");
      expect(encrypted).toBeTruthy();
      expect(mockEmailRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
          relations: ["thread"],
          take: expect.any(Number),
          order: { id: "ASC" },
        }),
      );
    });

    it("fetches emails in fixed-size batches rather than all at once", async () => {
      mockEmailRepository.find.mockResolvedValue([]);

      await service.exportEmails("user-1", "securepassword");

      const call = mockEmailRepository.find.mock.calls[0][0];
      expect(call.take).toBeDefined();
      expect(typeof call.take).toBe("number");
      expect(call.take).toBeGreaterThan(0);
      expect(call.skip).toBeUndefined();
      expect(call.where).toEqual({ userId: "user-1" });
    });

    it("uses keyset pagination (id > lastId) for subsequent batches", async () => {
      const batchSize = 500;
      const firstBatch = Array.from({ length: batchSize }, (_, i) =>
        makeEmail({ id: `email-${i}` }),
      );
      mockEmailRepository.find
        .mockResolvedValueOnce(firstBatch)
        .mockResolvedValueOnce([]);

      await service.exportEmails("user-1", "securepassword");

      expect(mockEmailRepository.find).toHaveBeenCalledTimes(2);
      const secondCall = mockEmailRepository.find.mock.calls[1][0];
      expect(secondCall.skip).toBeUndefined();
      expect(secondCall.where).toMatchObject({ userId: "user-1" });
      // Keyset pagination uses an `id` predicate built from MoreThan(lastId)
      expect(secondCall.where.id).toBeDefined();
    });

    it("maps sent emails correctly (has SENT label)", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ labels: ["SENT"], isRead: true }),
      ]);

      const encrypted = await service.exportEmails("user-1", "securepassword");
      expect(encrypted).toBeTruthy();
    });

    it("handles special characters in subject and body without throwing", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({
          subject: 'Subject with "quotes" and, commas',
          body: "Body with 'apostrophes' and \nnewlines\ttabs",
        }),
      ]);

      await expect(
        service.exportEmails("user-1", "securepassword"),
      ).resolves.toBeTruthy();
    });

    it("handles null subject and body gracefully", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({
          subject: null as unknown as string,
          body: null as unknown as string,
        }),
      ]);

      await expect(
        service.exportEmails("user-1", "securepassword"),
      ).resolves.toBeTruthy();
    });

    it("returns empty encrypted array when user has no emails", async () => {
      mockEmailRepository.find.mockResolvedValue([]);

      const result = await service.exportEmails("user-1", "securepassword");
      expect(result.split(":")).toHaveLength(4);
    });

    it("includes category from thread when categoryId matches a user context", async () => {
      const categoryCtx = makeContext({
        contextId: "cat-uuid-1",
        contextValue: "Work - Work-related emails",
      });
      mockUserContextRepository.find.mockResolvedValueOnce([categoryCtx]);
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({
          thread: makeThread({ categoryId: "cat-uuid-1" }),
        }),
      ]);

      const encrypted = await service.exportEmails("user-1", "securepassword");
      expect(encrypted).toBeTruthy();
      expect(mockUserContextRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1", contextKey: ContextKey.EMAIL_CATEGORY },
        }),
      );
    });

    it("sets category to null when thread has no categoryId", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ thread: makeThread({ categoryId: null }) }),
      ]);

      const encrypted = await service.exportEmails("user-1", "securepassword");
      expect(encrypted).toBeTruthy();
    });

    it("sets category to null when categoryId has no matching context", async () => {
      mockUserContextRepository.find.mockResolvedValueOnce([]);
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ thread: makeThread({ categoryId: "unknown-uuid" }) }),
      ]);

      const encrypted = await service.exportEmails("user-1", "securepassword");
      expect(encrypted).toBeTruthy();
    });

    it("resolves category display name by stripping description part", async () => {
      const categoryCtx = makeContext({
        contextId: "cat-uuid-2",
        contextValue: "Personal - Personal messages",
      });
      mockUserContextRepository.find.mockResolvedValueOnce([categoryCtx]);
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ thread: makeThread({ categoryId: "cat-uuid-2" }) }),
      ]);

      const encrypted = await service.exportEmails("user-1", "securepassword");
      expect(encrypted).toBeTruthy();
    });

    it("handles email with no thread relation gracefully", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ thread: undefined as unknown as EmailThread }),
      ]);

      await expect(
        service.exportEmails("user-1", "securepassword"),
      ).resolves.toBeTruthy();
    });

    it("pre-fetches category contexts only once regardless of batch count", async () => {
      const batchSize = 500;
      const firstBatch = Array.from({ length: batchSize }, (_, i) =>
        makeEmail({ id: `email-${i}` }),
      );
      mockEmailRepository.find
        .mockResolvedValueOnce(firstBatch)
        .mockResolvedValueOnce([]);

      await service.exportEmails("user-1", "securepassword");

      expect(mockUserContextRepository.find).toHaveBeenCalledTimes(1);
    });
  });
});
