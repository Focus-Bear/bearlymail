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
