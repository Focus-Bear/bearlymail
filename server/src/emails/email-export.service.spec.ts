import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Readable } from "stream";

import { CategoryOverride } from "../database/entities/category-override.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { GITHUB_RESERVED_CATEGORY_KEYS } from "../github/github-category-override.service";
import {
  EmailExportService,
  ExportEmailRecord,
  MAX_EXPORT_EMAILS,
  MIN_CATEGORY_SUPPORT,
} from "./email-export.service";

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

    it("sets weight and labelSource per label origin (no gate)", async () => {
      mockCategoryOverrideRepository.find.mockResolvedValue([
        { emailThreadId: "thread-corrected" } as CategoryOverride,
      ]);
      mockUserContextRepository.find.mockResolvedValue([
        makeContext({ contextId: "cat-work", contextValue: "Work - work" }),
      ]);
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({
          id: "e-user",
          threadId: "gt-user",
          thread: makeThread({
            id: "thread-corrected",
            categoryId: "cat-work",
          }),
        }),
        makeEmail({
          id: "e-model",
          threadId: "gt-model",
          thread: makeThread({ id: "thread-model", categoryId: "cat-work" }),
        }),
        makeEmail({
          id: "e-none",
          threadId: "gt-none",
          thread: makeThread({ id: "thread-none", categoryId: null }),
        }),
      ]);

      const byId: Record<string, ExportEmailRecord> = {};
      for await (const rec of service.streamExportableRecords("user-1")) {
        byId[rec.threadId ?? ""] = rec;
      }

      expect(byId["gmail-thread-1"]).toBeUndefined();
      const records = Object.values(byId);
      const user = records.find(
        (rec) => rec.category === "Work" && rec.weight === 3,
      );
      const model = records.find(
        (rec) => rec.category === "Work" && rec.weight === 1,
      );
      const none = records.find((rec) => rec.category === null);
      expect(user?.labelSource).toBe("user");
      expect(model?.labelSource).toBe("model");
      expect(none?.labelSource).toBe("none");
      expect(none?.weight).toBe(1);
    });
  });

  describe("streamExportableRecords with trainingGate", () => {
    /** Route the reserved-fallback lookup vs the category map off the query shape. */
    const mockContextsAndReserved = (
      categories: UserContext[],
      reservedIds: string[] = [],
    ): void => {
      mockUserContextRepository.find.mockImplementation(
        (opts: { where?: { categoryKey?: string } }) => {
          if (
            opts?.where?.categoryKey ===
            GITHUB_RESERVED_CATEGORY_KEYS.BOT_UPDATES
          ) {
            return Promise.resolve(
              reservedIds.map((id) => ({ contextId: id })),
            );
          }
          return Promise.resolve(categories);
        },
      );
    };

    const collect = async (): Promise<ExportEmailRecord[]> => {
      const out: ExportEmailRecord[] = [];
      for await (const rec of service.streamExportableRecords("user-1", {
        trainingGate: true,
      })) {
        out.push(rec);
      }
      return out;
    };

    it("keeps categories with enough examples and drops rare ones to null", async () => {
      mockContextsAndReserved([
        makeContext({ contextId: "cat-work", contextValue: "Work - work" }),
        makeContext({ contextId: "cat-rare", contextValue: "Rare - rare" }),
      ]);
      mockEmailRepository.find.mockResolvedValue([
        ...Array.from({ length: MIN_CATEGORY_SUPPORT }, (_, i) =>
          makeEmail({
            id: `work-${i}`,
            thread: makeThread({ id: `t-work-${i}`, categoryId: "cat-work" }),
          }),
        ),
        makeEmail({
          id: "rare-0",
          threadId: "gt-rare-0",
          thread: makeThread({ id: "t-rare-0", categoryId: "cat-rare" }),
        }),
      ]);

      const records = await collect();
      const work = records.filter((rec) => rec.category === "Work");
      const rare = records.find((rec) => rec.threadId === "gt-rare-0");
      expect(work).toHaveLength(MIN_CATEGORY_SUPPORT);
      expect(records.some((rec) => rec.category === "Rare")).toBe(false);
      expect(rare?.category).toBeNull();
      expect(rare?.labelSource).toBe("none");
    });

    it("always keeps a user-corrected category even when rare", async () => {
      mockCategoryOverrideRepository.find.mockResolvedValue([
        { emailThreadId: "t-vip" } as CategoryOverride,
      ]);
      mockContextsAndReserved([
        makeContext({ contextId: "cat-vip", contextValue: "VIP - vip" }),
      ]);
      mockEmailRepository.find.mockResolvedValue([
        makeEmail({
          id: "vip-0",
          thread: makeThread({ id: "t-vip", categoryId: "cat-vip" }),
        }),
      ]);

      const [record] = await collect();
      expect(record.category).toBe("VIP");
      expect(record.labelSource).toBe("user");
      expect(record.weight).toBe(3);
    });

    it("excludes the reserved bot-updates category as a label", async () => {
      mockContextsAndReserved(
        [makeContext({ contextId: "cat-bot", contextValue: "Bot - bot" })],
        ["cat-bot"],
      );
      mockEmailRepository.find.mockResolvedValue([
        ...Array.from({ length: MIN_CATEGORY_SUPPORT }, (_, i) =>
          makeEmail({
            id: `bot-${i}`,
            thread: makeThread({ id: `t-bot-${i}`, categoryId: "cat-bot" }),
          }),
        ),
      ]);

      const records = await collect();
      expect(records.every((rec) => rec.category === null)).toBe(true);
    });
  });

  describe("buildEncryptedZipStream", () => {
    it("returns a core node:stream Readable (required by @aws-sdk/lib-storage)", () => {
      mockEmailRepository.find.mockResolvedValue([]);

      const { archive } = service.buildEncryptedZipStream(
        "user-1",
        "securepassword",
      );

      // lib-storage's chunker does `data instanceof Readable` against the core
      // stream module; archiver's own streams (userland readable-stream) fail
      // that check with "Body Data is unsupported format" (prod export bug).
      expect(archive).toBeInstanceOf(Readable);
    });

    it("propagates source errors to the returned stream so the upload rejects", async () => {
      mockEmailRepository.find.mockRejectedValue(new Error("db down"));

      const { archive } = service.buildEncryptedZipStream(
        "user-1",
        "securepassword",
      );

      await expect(
        (async () => {
          for await (const _ of archive) {
            // drain
          }
        })(),
      ).rejects.toThrow("db down");
    });

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
