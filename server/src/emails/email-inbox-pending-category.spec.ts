/**
 * "AI deciding category" bucket: threads with no category whose refine job is
 * still running must be reported apart from "Other" — in the per-email inbox
 * payload (isCategoryPending), the inbox summary, and per-category fetches.
 *
 * EncryptionHelper.tryDecrypt is fail-open (returns non-ciphertext unchanged),
 * so plaintext category names stand in for encrypted contextValues.
 */
import { EmailInboxService } from "./email-inbox.service";
import {
  INBOX_OTHER_CATEGORY_NAME,
  INBOX_PENDING_CATEGORY_KEY,
  INBOX_PENDING_CATEGORY_NAME,
  INBOX_UNCATEGORIZED_CATEGORY_KEY,
  RawEmailRow,
} from "./email-inbox.types";
import { EmailInboxCategoryService } from "./email-inbox-category.service";
import { EmailInboxDecryptService } from "./email-inbox-decrypt.service";
import { InboxEmail } from "./interfaces/inbox-email.interface";
import { PerformanceTracker } from "./performance-tracker";

const USER_ID = "user-1";
const WORK_CATEGORY_ID = "11111111-1111-1111-1111-111111111111";
const WORK_CATEGORY_NAME = "Work";

function makeRawRow(overrides: Partial<RawEmailRow>): RawEmailRow {
  return {
    id: "email-1",
    userId: USER_ID,
    threadId: "thread-1",
    emailThreadId: "thread-uuid",
    from: "sender@example.com",
    subject: "Subject",
    summary: "Summary",
    isProcessingSummary: false,
    isProcessingPriority: false,
    categoryId: null,
    categoryName: null,
    receivedAt: new Date(0),
    ...overrides,
  } as unknown as RawEmailRow;
}

function makeCategoryService(): EmailInboxCategoryService {
  const blockedSendersService = {
    isSenderBlocked: jest.fn().mockResolvedValue(false),
  };
  return new EmailInboxCategoryService(
    blockedSendersService as never,
    { findOne: jest.fn() } as never,
  );
}

function makeInboxService(summaryRows: unknown[] = []): EmailInboxService {
  const emailThreadRepository = {
    query: jest.fn().mockResolvedValue(summaryRows),
  };
  const userContextRepository = {
    find: jest.fn().mockResolvedValue([
      {
        contextId: WORK_CATEGORY_ID,
        contextValue: WORK_CATEGORY_NAME,
        createdAt: new Date(0),
      },
    ]),
  };
  const blockedSendersService = {
    getBlockedEmailHashes: jest.fn().mockResolvedValue(undefined),
    filterBlockedEmails: jest.fn().mockResolvedValue([]),
  };
  return new EmailInboxService(
    {} as never,
    emailThreadRepository as never,
    userContextRepository as never,
    blockedSendersService as never,
    {} as never,
    makeCategoryService(),
    {} as never,
    undefined,
  );
}

describe("isCategoryPending in the inbox payload", () => {
  const decryptService = new EmailInboxDecryptService(
    null as never,
    null as never,
  );

  it("is true for an uncategorised thread whose refine job is running", () => {
    const email = decryptService.decryptRawEmailRow(
      makeRawRow({ isProcessingPriority: true }),
    );

    expect(email.isCategoryPending).toBe(true);
    expect(email.categoryId).toBeNull();
  });

  it("is false once the thread settled as Other", () => {
    const email = decryptService.decryptRawEmailRow(
      makeRawRow({ isProcessingPriority: false }),
    );

    expect(email.isCategoryPending).toBe(false);
    expect(email.category).toBe(INBOX_OTHER_CATEGORY_NAME);
  });

  it("is false for a categorised thread being re-prioritised", () => {
    const email = decryptService.decryptRawEmailRow(
      makeRawRow({
        isProcessingPriority: true,
        categoryId: WORK_CATEGORY_ID,
        categoryName: WORK_CATEGORY_NAME,
      }),
    );

    expect(email.isCategoryPending).toBe(false);
  });

  it("treats an orphaned category UUID as uncategorised", () => {
    const email = decryptService.decryptRawEmailRow(
      makeRawRow({ isProcessingPriority: true, categoryId: WORK_CATEGORY_ID }),
    );

    expect(email.isCategoryPending).toBe(true);
  });
});

describe("pending bucket in the category counts", () => {
  const countRows = (
    rows: Parameters<
      EmailInboxCategoryService["countRowsByCategory"]
    >[0]["rows"],
  ) =>
    makeCategoryService().countRowsByCategory({
      userId: USER_ID,
      mode: "triage",
      rows,
      includeThreadIds: false,
      needsUserSentLastFilter: false,
      userEmailLower: null,
    });

  it("counts in-flight uncategorised threads apart from Other and lists them first", async () => {
    const result = await countRows([
      {
        categoryId: WORK_CATEGORY_ID,
        categoryName: WORK_CATEGORY_NAME,
        priorityScore: 90,
      },
      { categoryId: null, categoryName: null, isProcessingPriority: false },
      { categoryId: null, categoryName: null, isProcessingPriority: true },
      { categoryId: null, categoryName: null, isProcessingPriority: true },
    ]);

    expect(result.categoryOrder[0]).toBe(INBOX_PENDING_CATEGORY_NAME);
    expect(result.categoryCounts[INBOX_PENDING_CATEGORY_NAME]).toBe(2);
    expect(result.categoryCounts[INBOX_OTHER_CATEGORY_NAME]).toBe(1);
    expect(result.categoryCounts[WORK_CATEGORY_NAME]).toBe(1);
  });

  it("keeps a categorised thread in its category while it is re-prioritised", async () => {
    const result = await countRows([
      {
        categoryId: WORK_CATEGORY_ID,
        categoryName: WORK_CATEGORY_NAME,
        isProcessingPriority: true,
      },
    ]);

    expect(result.categoryOrder).toEqual([WORK_CATEGORY_NAME]);
  });

  it("shows the pending bucket for an Other filter but not for a real-category filter", () => {
    const service = makeCategoryService();
    const order = [
      INBOX_PENDING_CATEGORY_NAME,
      WORK_CATEGORY_NAME,
      INBOX_OTHER_CATEGORY_NAME,
    ];
    const uuidByName = new Map([[WORK_CATEGORY_NAME, WORK_CATEGORY_ID]]);
    const nameToId = new Map([[WORK_CATEGORY_NAME, WORK_CATEGORY_ID]]);

    expect(
      service.filterVisibleCategoriesByIds(
        USER_ID,
        order,
        uuidByName,
        nameToId,
        [INBOX_UNCATEGORIZED_CATEGORY_KEY],
      ),
    ).toEqual([INBOX_PENDING_CATEGORY_NAME, INBOX_OTHER_CATEGORY_NAME]);
    expect(
      service.filterVisibleCategoriesByIds(
        USER_ID,
        order,
        uuidByName,
        nameToId,
        [WORK_CATEGORY_ID],
      ),
    ).toEqual([WORK_CATEGORY_NAME]);
  });
});

describe("getInboxSummary pending entry", () => {
  it("returns the pending bucket with its sentinel id ahead of the other categories", async () => {
    const service = makeInboxService([
      {
        categoryId: WORK_CATEGORY_ID,
        categoryName: WORK_CATEGORY_NAME,
        priorityScore: 80,
        isProcessingPriority: false,
      },
      { categoryId: null, categoryName: null, isProcessingPriority: true },
      { categoryId: null, categoryName: null, isProcessingPriority: false },
    ]);

    const summary = await service.getInboxSummary(USER_ID, "triage");

    expect(summary.categories).toEqual([
      {
        id: INBOX_PENDING_CATEGORY_KEY,
        name: INBOX_PENDING_CATEGORY_NAME,
        count: 1,
      },
      { id: WORK_CATEGORY_ID, name: WORK_CATEGORY_NAME, count: 1 },
      { id: null, name: INBOX_OTHER_CATEGORY_NAME, count: 1 },
    ]);
    expect(summary.total).toBe(3);
  });

  it("projects isProcessingPriority so the summary can tell pending from Other", async () => {
    const service = makeInboxService();
    await service.getInboxSummary(USER_ID, "triage");
    const repository = (
      service as unknown as {
        emailThreadRepository: { query: jest.Mock };
      }
    ).emailThreadRepository;
    const [sql] = repository.query.mock.calls[0] as [string];

    expect(sql).toContain('thread."isProcessingPriority"');
  });
});

describe("per-category fetch of the pending bucket", () => {
  const pendingEmail = {
    id: "pending",
    from: "a@example.com",
    categoryId: null,
    category: INBOX_OTHER_CATEGORY_NAME,
    isCategoryPending: true,
  } as unknown as InboxEmail;
  const otherEmail = {
    id: "other",
    from: "b@example.com",
    categoryId: null,
    category: INBOX_OTHER_CATEGORY_NAME,
    isCategoryPending: false,
  } as unknown as InboxEmail;
  const workEmail = {
    id: "work",
    from: "c@example.com",
    categoryId: WORK_CATEGORY_ID,
    category: WORK_CATEGORY_NAME,
    isCategoryPending: false,
  } as unknown as InboxEmail;
  const allEmails = [pendingEmail, otherEmail, workEmail];

  const fetchIds = async (categoryIds: string[]) => {
    const { emails } = await makeInboxService().applyPostQueryFilters(
      USER_ID,
      "triage",
      allEmails,
      new PerformanceTracker("test"),
      { filters: { categoryIds } },
    );
    return emails.map((email) => email.id);
  };

  it("returns only the threads still being categorised", async () => {
    expect(await fetchIds([INBOX_PENDING_CATEGORY_KEY])).toEqual(["pending"]);
  });

  it("leaves pending threads out of Other", async () => {
    expect(await fetchIds([INBOX_UNCATEGORIZED_CATEGORY_KEY])).toEqual([
      "other",
    ]);
  });

  it("leaves pending threads out of real categories", async () => {
    expect(await fetchIds([WORK_CATEGORY_ID])).toEqual(["work"]);
  });
});
