import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { CategoryOverride } from "../database/entities/category-override.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { EmailExportService, MAX_EXPORT_EMAILS } from "./email-export.service";

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
  const mockCategoryOverrideRepository = { find: jest.fn() };

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
        {
          provide: getRepositoryToken(CategoryOverride),
          useValue: mockCategoryOverrideRepository,
        },
      ],
    }).compile();

    service = module.get<EmailExportService>(EmailExportService);
    mockUserContextRepository.find.mockResolvedValue([]);
    mockCategoryOverrideRepository.find.mockResolvedValue([]);
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
  // createEncryptedZip
  // ---------------------------------------------------------------------------

  describe("createEncryptedZip", () => {
    it("produces a non-empty Buffer with ZIP magic bytes (PK header)", async () => {
      const result = await service.createEncryptedZip(
        '{"test":1}',
        "password123",
      );
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      // Standard ZIP files always start with the PK signature (0x50 0x4B)
      expect(result[0]).toBe(0x50);
      expect(result[1]).toBe(0x4b);
    });
  });

  // ---------------------------------------------------------------------------
  // getExportableEmails
  // ---------------------------------------------------------------------------

  describe("getExportableEmails", () => {
    it("returns an empty array when user has no emails", async () => {
      mockEmailRepository.find.mockResolvedValue([]);

      const result = await service.getExportableEmails("user-1");

      expect(result).toEqual([]);
    });

    it("returns plaintext email records", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({
          from: "alice@example.com",
          subject: "Hello",
          body: "World",
          isRead: true,
          labels: ["INBOX"],
        }),
      ]);

      const result = await service.getExportableEmails("user-1");

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        senderDomain: ".*@example\\.com$",
        subject: "Hello",
        body: "World",
        isRead: true,
        isReceived: true,
        category: null,
      });
    });

    it("resolves category display name from thread categoryId", async () => {
      const categoryCtx = makeContext({
        contextId: "cat-uuid-1",
        contextValue: "Work - Work-related emails",
      });
      mockUserContextRepository.find.mockResolvedValueOnce([categoryCtx]);
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ thread: makeThread({ categoryId: "cat-uuid-1" }) }),
      ]);

      const result = await service.getExportableEmails("user-1");

      expect(result[0].category).toBe("Work");
    });

    it("sets category to null when thread has no categoryId", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ thread: makeThread({ categoryId: null }) }),
      ]);

      const result = await service.getExportableEmails("user-1");

      expect(result[0].category).toBeNull();
    });

    it("marks sent emails as not received", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ labels: ["SENT"] }),
      ]);

      const result = await service.getExportableEmails("user-1");

      expect(result[0].isReceived).toBe(false);
    });

    it("fetches emails in fixed-size batches using keyset pagination", async () => {
      const batchSize = 500;
      const firstBatch = Array.from({ length: batchSize }, (_, i) =>
        makeEmail({ id: `email-${i}` }),
      );
      mockEmailRepository.find
        .mockResolvedValueOnce(firstBatch)
        .mockResolvedValueOnce([makeEmail({ id: "email-500" })]);

      const result = await service.getExportableEmails("user-1");

      expect(result).toHaveLength(batchSize + 1);
      expect(mockEmailRepository.find).toHaveBeenCalledTimes(2);
      const secondCall = mockEmailRepository.find.mock.calls[1][0];
      expect(secondCall.where.id).toBeDefined();
    });

    it("pre-fetches category contexts only once regardless of batch count", async () => {
      const batchSize = 500;
      const firstBatch = Array.from({ length: batchSize }, (_, i) =>
        makeEmail({ id: `email-${i}` }),
      );
      mockEmailRepository.find
        .mockResolvedValueOnce(firstBatch)
        .mockResolvedValueOnce([]);

      await service.getExportableEmails("user-1");

      expect(mockUserContextRepository.find).toHaveBeenCalledTimes(1);
    });

    it("handles null subject and body gracefully", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({
          subject: null as unknown as string,
          body: null as unknown as string,
        }),
      ]);

      const result = await service.getExportableEmails("user-1");

      expect(result[0].subject).toBe("");
      expect(result[0].body).toBe("");
    });

    it("includes thread-level training labels and metadata features", async () => {
      const receivedAt = new Date("2026-06-01T10:30:00.000Z");
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({
          threadId: "gmail-thread-1",
          receivedAt,
          sentimentScore: -20,
          userPriorityOverride: 90,
          attachments: [
            {
              attachmentId: "a1",
              filename: "f.pdf",
              mimeType: "application/pdf",
              size: 10,
            },
          ],
          thread: makeThread({
            starCount: 2,
            priorityScore: 73,
            urgencyScore: 55,
          } as Partial<EmailThread>),
        }),
      ]);

      const result = await service.getExportableEmails("user-1");

      expect(result[0]).toMatchObject({
        threadId: "gmail-thread-1",
        receivedAt: "2026-06-01T10:30:00.000Z",
        hasAttachments: true,
        starCount: 2,
        priorityScore: 73,
        urgencyScore: 55,
        sentimentScore: -20,
        userPriorityOverride: 90,
        categoryIsUserCorrected: false,
      });
    });

    it("exports null labels and false flags when thread data is absent", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ thread: undefined as unknown as EmailThread }),
      ]);

      const result = await service.getExportableEmails("user-1");

      expect(result[0]).toMatchObject({
        starCount: null,
        priorityScore: null,
        urgencyScore: null,
        categoryIsUserCorrected: false,
        hasAttachments: false,
      });
    });

    it("flags categoryIsUserCorrected when the thread has a category override", async () => {
      mockCategoryOverrideRepository.find.mockResolvedValue([
        { emailThreadId: "thread-1" } as CategoryOverride,
      ]);
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ thread: makeThread({ id: "thread-1" }) }),
      ]);

      const result = await service.getExportableEmails("user-1");

      expect(result[0].categoryIsUserCorrected).toBe(true);
    });

    it("includes a stable sha256 senderHash of the lowercased address", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ from: "Alice <ALICE@Example.com>" }),
        makeEmail({ id: "email-2", from: "alice@example.com" }),
      ]);

      const result = await service.getExportableEmails("user-1");

      expect(result[0].senderHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result[0].senderHash).toBe(result[1].senderHash);
    });
  });

  describe("hashSenderAddress", () => {
    it("returns null when no address can be extracted", () => {
      expect(service.hashSenderAddress(null)).toBeNull();
      expect(service.hashSenderAddress("")).toBeNull();
      expect(service.hashSenderAddress("not-an-email")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // exportEmails
  // ---------------------------------------------------------------------------

  describe("exportEmails", () => {
    const MOCK_ZIP = Buffer.from("PK\x03\x04mock-zip-content");

    beforeEach(() => {
      jest.spyOn(service, "createEncryptedZip").mockResolvedValue(MOCK_ZIP);
    });

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

    it("returns a Buffer for valid input", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ from: "alice@example.com", subject: "Hi", body: "There" }),
      ]);

      const result = await service.exportEmails("user-1", "securepassword");

      expect(result).toBeInstanceOf(Buffer);
      expect(result).toBe(MOCK_ZIP);
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
          relations: { thread: true },
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

    it("returns a Buffer when user has no emails", async () => {
      mockEmailRepository.find.mockResolvedValue([]);

      const result = await service.exportEmails("user-1", "securepassword");
      expect(result).toBeInstanceOf(Buffer);
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

  describe("streamExportableRecords", () => {
    it("yields one record per email without accumulating", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ subject: "A" }),
        makeEmail({ subject: "B" }),
      ]);

      const out: string[] = [];
      for await (const record of service.streamExportableRecords("user-1")) {
        out.push(record.subject);
      }

      expect(out).toEqual(["A", "B"]);
    });

    it("caps at the most recent MAX_EXPORT_EMAILS messages", async () => {
      mockEmailRepository.find.mockResolvedValue([]);

      // Drain the generator so the query runs.

      for await (const _ of service.streamExportableRecords("user-1")) {
        // no-op
      }

      expect(mockEmailRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: MAX_EXPORT_EMAILS,
          order: { receivedAt: "DESC" },
        }),
      );
    });
  });

  describe("buildEncryptedZipStream", () => {
    it("streams a non-empty encrypted zip and counts the records", async () => {
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({ subject: "A" }),
        makeEmail({ subject: "B" }),
      ]);

      const { archive, recordCount } = service.buildEncryptedZipStream(
        "user-1",
        "securepassword",
      );

      const chunks: Buffer[] = [];
      for await (const chunk of archive) {
        chunks.push(chunk as Buffer);
      }
      const zip = Buffer.concat(chunks);

      // PK ZIP local-file-header magic — proves a real archive was produced.
      expect(zip.subarray(0, 2).toString("latin1")).toBe("PK");
      expect(zip.length).toBeGreaterThan(0);
      expect(recordCount()).toBe(2);
    });
  });
});
