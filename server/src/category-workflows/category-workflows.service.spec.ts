import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { CategoryArchiveStat } from "../database/entities/category-archive-stat.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { EmailArchiveService } from "../emails/email-archive.service";
import {
  ARCHIVE_ALL_SUGGESTION_THRESHOLD,
  CategoryWorkflowsService,
} from "./category-workflows.service";

const CATEGORY_ID = "cat-1";

/** Two unread emails in two threads, both under the same category. */
const blindEmails = [
  { id: "e1", isRead: false, emailThreadId: "t1" },
  { id: "e2", isRead: false, emailThreadId: "t2" },
];
const blindThreads = [
  { id: "t1", categoryId: CATEGORY_ID, starCount: 0, isSnoozed: false },
  { id: "t2", categoryId: CATEGORY_ID, starCount: 0, isSnoozed: false },
];

describe("CategoryWorkflowsService", () => {
  let service: CategoryWorkflowsService;
  let statRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let emailRepo: { find: jest.Mock };
  let threadRepo: { find: jest.Mock };
  let userContextRepo: { findOne: jest.Mock };
  let archiveService: { bulkArchiveEmails: jest.Mock };

  beforeEach(async () => {
    statRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((partial) => ({ ...partial })),
      save: jest.fn(async (stat) => stat),
    };
    emailRepo = { find: jest.fn().mockResolvedValue(blindEmails) };
    threadRepo = { find: jest.fn().mockResolvedValue(blindThreads) };
    userContextRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ contextValue: "Newsletters - promo mail" }),
    };
    archiveService = {
      bulkArchiveEmails: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryWorkflowsService,
        {
          provide: getRepositoryToken(CategoryArchiveStat),
          useValue: statRepo,
        },
        { provide: getRepositoryToken(Email), useValue: emailRepo },
        { provide: getRepositoryToken(EmailThread), useValue: threadRepo },
        { provide: getRepositoryToken(UserContext), useValue: userContextRepo },
        { provide: EmailArchiveService, useValue: archiveService },
      ],
    }).compile();

    service = module.get(CategoryWorkflowsService);
  });

  it("always archives the emails, even when tracking is skipped", async () => {
    await service.archiveAllInCategory("user-1", ["e1", "e2"]);
    expect(archiveService.bulkArchiveEmails).toHaveBeenCalledWith("user-1", [
      "e1",
      "e2",
    ]);
  });

  it("returns no suggestion for an empty batch and does not archive", async () => {
    const result = await service.archiveAllInCategory("user-1", []);
    expect(result).toEqual({ archived: 0, suggestion: null });
    expect(archiveService.bulkArchiveEmails).not.toHaveBeenCalled();
  });

  it("increments the blind counter but does not suggest below the threshold", async () => {
    statRepo.findOne.mockResolvedValue({
      userId: "user-1",
      categoryId: CATEGORY_ID,
      blindArchiveAllCount: 0,
      suggestionState: "none",
      lastArchiveAllAt: null,
    });

    const result = await service.archiveAllInCategory("user-1", ["e1", "e2"]);

    expect(statRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ blindArchiveAllCount: 1 }),
    );
    expect(result.suggestion).toBeNull();
  });

  it("suggests an auto-archive workflow on the threshold-th blind archive-all", async () => {
    statRepo.findOne.mockResolvedValue({
      userId: "user-1",
      categoryId: CATEGORY_ID,
      blindArchiveAllCount: ARCHIVE_ALL_SUGGESTION_THRESHOLD - 1,
      suggestionState: "none",
      lastArchiveAllAt: null,
    });

    const result = await service.archiveAllInCategory("user-1", ["e1", "e2"]);

    expect(result.suggestion).toEqual({
      categoryId: CATEGORY_ID,
      categoryName: "Newsletters",
    });
  });

  it("does not suggest again once the user has dismissed", async () => {
    statRepo.findOne.mockResolvedValue({
      userId: "user-1",
      categoryId: CATEGORY_ID,
      blindArchiveAllCount: 10,
      suggestionState: "dismissed",
      lastArchiveAllAt: null,
    });

    const result = await service.archiveAllInCategory("user-1", ["e1", "e2"]);
    expect(result.suggestion).toBeNull();
  });

  it("resets the counter when the batch was read or actioned", async () => {
    threadRepo.find.mockResolvedValue([
      { id: "t1", categoryId: CATEGORY_ID, starCount: 2, isSnoozed: false },
      { id: "t2", categoryId: CATEGORY_ID, starCount: 0, isSnoozed: false },
    ]);
    statRepo.findOne.mockResolvedValue({
      userId: "user-1",
      categoryId: CATEGORY_ID,
      blindArchiveAllCount: ARCHIVE_ALL_SUGGESTION_THRESHOLD - 1,
      suggestionState: "none",
      lastArchiveAllAt: null,
    });

    const result = await service.archiveAllInCategory("user-1", ["e1", "e2"]);

    expect(statRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ blindArchiveAllCount: 0 }),
    );
    expect(result.suggestion).toBeNull();
  });

  it("skips tracking when the batch spans multiple categories", async () => {
    threadRepo.find.mockResolvedValue([
      { id: "t1", categoryId: "cat-1", starCount: 0, isSnoozed: false },
      { id: "t2", categoryId: "cat-2", starCount: 0, isSnoozed: false },
    ]);

    const result = await service.archiveAllInCategory("user-1", ["e1", "e2"]);

    expect(result.suggestion).toBeNull();
    expect(statRepo.save).not.toHaveBeenCalled();
    expect(archiveService.bulkArchiveEmails).toHaveBeenCalled();
  });

  it("records the user's suggestion response", async () => {
    await service.respondToSuggestion("user-1", CATEGORY_ID, "dismissed");
    expect(statRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ suggestionState: "dismissed" }),
    );
  });
});
