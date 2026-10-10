import { Test } from "@nestjs/testing";

import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UsersService } from "../users/users.service";
import {
  EmailInboxCategoryService,
  INBOX_OTHER_CATEGORY_NAME,
} from "./email-inbox-category.service";

describe("EmailInboxCategoryService", () => {
  let service: EmailInboxCategoryService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailInboxCategoryService,
        {
          provide: BlockedSendersService,
          useValue: { isSenderBlocked: jest.fn().mockResolvedValue(false) },
        },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(EmailInboxCategoryService);
  });

  it("buckets orphan categoryId with null categoryName as Other without UUID mapping", async () => {
    const result = await service.countRowsByCategory({
      userId: "user-1",
      mode: "triage",
      rows: [
        {
          categoryName: null,
          categoryId: "550e8400-e29b-41d4-a716-446655440000",
        },
      ],
      includeThreadIds: false,
      needsUserSentLastFilter: false,
      userEmailLower: null,
    });

    expect(result.categoryOrder).toEqual([INBOX_OTHER_CATEGORY_NAME]);
    expect(result.categoryCounts[INBOX_OTHER_CATEGORY_NAME]).toBe(1);
    expect(
      result.categoryUuidByName.get(INBOX_OTHER_CATEGORY_NAME),
    ).toBeUndefined();
  });

  it("does not map Other to a UUID when tryDecrypt still looks like ciphertext", async () => {
    const ivHex = "a".repeat(32);
    const fakeCiphertext = `${ivHex}:${"b".repeat(32)}:${"c".repeat(16)}`;
    jest.spyOn(EncryptionHelper, "tryDecrypt").mockReturnValue(fakeCiphertext);

    const result = await service.countRowsByCategory({
      userId: "user-1",
      mode: "triage",
      rows: [
        {
          categoryName: "encrypted-column-placeholder",
          categoryId: "550e8400-e29b-41d4-a716-446655440001",
        },
      ],
      includeThreadIds: false,
      needsUserSentLastFilter: false,
      userEmailLower: null,
    });

    expect(result.categoryOrder).toEqual([INBOX_OTHER_CATEGORY_NAME]);
    expect(
      result.categoryUuidByName.get(INBOX_OTHER_CATEGORY_NAME),
    ).toBeUndefined();
  });
});

// ─── issue #2062: the summary applies the same action / follow-up rules as the list ──
describe("EmailInboxCategoryService — shared mode rules (#2062)", () => {
  let service: EmailInboxCategoryService;
  const USER_EMAIL = "me@example.com";
  const actionRules = {
    needsUserSentLastFilter: true,
    userEmailLower: USER_EMAIL,
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailInboxCategoryService,
        {
          provide: BlockedSendersService,
          useValue: { isSenderBlocked: jest.fn().mockResolvedValue(false) },
        },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(EmailInboxCategoryService);
    jest
      .spyOn(EncryptionHelper, "tryDecrypt")
      .mockImplementation((value: string) => value);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("action mode keeps a user-sent-last thread that is pinned with keepInAction, like the list does", async () => {
    const skipPinned = await service.shouldSkipSummaryRow(
      "user-1",
      "action",
      { latestFrom: USER_EMAIL, keepInAction: true },
      actionRules,
    );
    const skipPlain = await service.shouldSkipSummaryRow(
      "user-1",
      "action",
      { latestFrom: USER_EMAIL, keepInAction: false },
      actionRules,
    );
    const skipAutoResponded = await service.shouldSkipSummaryRow(
      "user-1",
      "action",
      { latestFrom: USER_EMAIL, sentByAutoResponder: true },
      actionRules,
    );
    expect(skipPinned).toBe(false);
    expect(skipPlain).toBe(true);
    expect(skipAutoResponded).toBe(false);
  });

  it("action mode matches the sender exactly rather than by substring", async () => {
    const skip = await service.shouldSkipSummaryRow(
      "user-1",
      "action",
      { latestFrom: `someone-else-${USER_EMAIL}` },
      actionRules,
    );
    expect(skip).toBe(false);
  });

  it("follow-up mode keeps exactly the threads the shared follow-up rule accepted", async () => {
    const followUpRules = {
      ...actionRules,
      followUpThreadIds: new Set(["t-1"]),
    };
    const keep = await service.shouldSkipSummaryRow(
      "user-1",
      "follow-up",
      { threadId: "t-1", latestFrom: USER_EMAIL },
      followUpRules,
    );
    const drop = await service.shouldSkipSummaryRow(
      "user-1",
      "follow-up",
      { threadId: "t-2", latestFrom: USER_EMAIL },
      followUpRules,
    );
    expect(keep).toBe(false);
    expect(drop).toBe(true);
  });
});
