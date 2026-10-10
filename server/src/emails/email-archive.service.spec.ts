import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { JOB_NAMES } from "../constants/job-names";
import { CategoryOverride } from "../database/entities/category-override.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { EmailArchiveService } from "./email-archive.service";
import { EmailCrudService } from "./email-crud.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailReadService } from "./email-read.service";
import { EmailThreadService } from "./email-thread.service";

const mockEmailRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
};

const mockEmailThreadRepository = {
  findOne: jest.fn(),
  update: jest.fn(),
  find: jest.fn(),
};

const mockCategoryOverrideRepository = {
  create: jest.fn(),
  save: jest.fn(),
};

const mockUserContextRepository = {
  find: jest.fn(),
  create: jest.fn((entity) => entity),
  save: jest.fn(),
};

const mockEmailCrudService = {
  getEmailById: jest.fn(),
};

const mockEmailThreadService = {
  updateThreadArchivedStatus: jest.fn(),
  updateThreadStarCount: jest.fn(),
};

const mockEmailReadService = {
  bulkMarkAsRead: jest.fn(),
};

const mockBoss = {
  send: jest.fn().mockResolvedValue("job-id"),
};

const mockEmailProviderManager = {
  getPrimaryProvider: jest.fn(),
};

describe("EmailArchiveService", () => {
  let service: EmailArchiveService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailArchiveService,
        {
          provide: getRepositoryToken(Email),
          useValue: mockEmailRepository,
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
        },
        {
          provide: getRepositoryToken(CategoryOverride),
          useValue: mockCategoryOverrideRepository,
        },
        {
          provide: getRepositoryToken(UserContext),
          useValue: mockUserContextRepository,
        },
        {
          provide: EmailCrudService,
          useValue: mockEmailCrudService,
        },
        {
          provide: EmailThreadService,
          useValue: mockEmailThreadService,
        },
        {
          provide: EmailReadService,
          useValue: mockEmailReadService,
        },
        {
          provide: "PG_BOSS",
          useValue: mockBoss,
        },
        {
          provide: EmailProviderManager,
          useValue: mockEmailProviderManager,
        },
      ],
    }).compile();

    service = module.get<EmailArchiveService>(EmailArchiveService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("archiveThreadById", () => {
    const thread = {
      id: "thread-uuid",
      threadId: "provider-thread-1",
      userId: "user-1",
      isArchived: false,
      starCount: 0,
    };

    beforeEach(() => {
      mockEmailThreadRepository.findOne.mockResolvedValue(thread);
      mockEmailRepository.find.mockResolvedValue([]);
    });

    it("flags the thread as archivedByWorkflow when archiving via a workflow", async () => {
      await service.archiveThreadById("user-1", "thread-uuid", {
        viaWorkflow: true,
      });

      expect(mockEmailThreadRepository.update).toHaveBeenCalledWith(
        { id: "thread-uuid", userId: "user-1" },
        { archivedByWorkflow: true },
      );
      expect(
        mockEmailThreadService.updateThreadArchivedStatus,
      ).toHaveBeenCalledWith("user-1", "provider-thread-1", true, true);
    });

    it("does not set archivedByWorkflow for a plain archive", async () => {
      await service.archiveThreadById("user-1", "thread-uuid");

      expect(mockEmailThreadRepository.update).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ archivedByWorkflow: true }),
      );
    });
  });

  describe("overrideCategory", () => {
    const userId = "user-uuid-1";
    const emailId = "email-uuid-1";
    const threadId = "thread-uuid-1";
    const newCategory = "Newsletters";
    const contextId = "context-uuid-1";
    const oldContextId = "old-context-uuid";

    const mockEmail = { id: emailId, userId, emailThreadId: threadId };
    const mockThread = {
      id: threadId,
      userId,
      categoryId: oldContextId,
    };
    const mockOverride = { id: "override-uuid-1" };
    const mockContexts: Partial<UserContext>[] = [
      {
        contextId,
        userId,
        contextKey: ContextKey.EMAIL_CATEGORY,
        contextValue: newCategory,
      },
      {
        contextId: oldContextId,
        userId,
        contextKey: ContextKey.EMAIL_CATEGORY,
        contextValue: "Customer Support",
      },
    ];

    beforeEach(() => {
      mockEmailRepository.findOne.mockResolvedValue(mockEmail);
      mockEmailThreadRepository.findOne.mockResolvedValue(mockThread);
      mockCategoryOverrideRepository.create.mockReturnValue(mockOverride);
      mockCategoryOverrideRepository.save.mockResolvedValue(mockOverride);
      mockEmailThreadRepository.update.mockResolvedValue({ affected: 1 });
      mockUserContextRepository.find.mockResolvedValue(mockContexts);
    });

    it("sets categoryId when a matching UserContext EMAIL_CATEGORY row exists", async () => {
      const result = await service.overrideCategory(
        userId,
        emailId,
        newCategory,
        "User requested",
      );

      expect(result).toEqual({
        success: true,
        category: newCategory,
        categoryId: contextId,
      });

      expect(mockUserContextRepository.find).toHaveBeenCalledWith({
        where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
        select: { contextId: true, contextValue: true, categoryKey: true },
      });

      expect(mockEmailThreadRepository.update).toHaveBeenCalledWith(
        { id: threadId },
        expect.objectContaining({
          categoryId: contextId,
        }),
      );
    });

    it("creates a new USER_EDITED category and assigns it when the name doesn't exist yet", async () => {
      mockUserContextRepository.find.mockResolvedValue([]);
      const createdId = "new-category-uuid";
      mockUserContextRepository.save.mockResolvedValue({
        contextId: createdId,
      });

      const result = await service.overrideCategory(
        userId,
        emailId,
        "Brand New Category",
      );

      // The new category was persisted as an EMAIL_CATEGORY / USER_EDITED
      // context with a name and a generated categoryKey.
      expect(mockUserContextRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          contextKey: ContextKey.EMAIL_CATEGORY,
          contextValue: "Brand New Category",
          source: Source.USER_EDITED,
          categoryKey: expect.any(String),
        }),
      );
      expect(mockUserContextRepository.save).toHaveBeenCalled();

      // The email is placed under the newly created category, not "Other".
      expect(result).toEqual({
        success: true,
        category: "Brand New Category",
        categoryId: createdId,
      });
      const updateCall = mockEmailThreadRepository.update.mock.calls[0];
      expect(updateCall[1]).toMatchObject({ categoryId: createdId });
    });

    it("gives the new category a categoryKey unique among existing keys", async () => {
      mockUserContextRepository.find.mockResolvedValue([
        {
          contextId: "c1",
          contextValue: "Existing",
          categoryKey: "brand_new_category",
        },
      ]);
      mockUserContextRepository.save.mockResolvedValue({ contextId: "new-id" });

      await service.overrideCategory(userId, emailId, "Brand New Category");

      const createArg = mockUserContextRepository.create.mock.calls[0][0];
      // Base slug collides with the existing key, so it must be suffixed.
      expect(createArg.categoryKey).not.toBe("brand_new_category");
      expect(createArg.categoryKey).toMatch(/^brand_new_category_\d+$/);
    });

    it("does NOT create a category when correcting to Other", async () => {
      mockUserContextRepository.find.mockResolvedValue([]);

      const result = await service.overrideCategory(userId, emailId, "Other");

      expect(mockUserContextRepository.create).not.toHaveBeenCalled();
      expect(mockUserContextRepository.save).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        category: "Other",
        categoryId: null,
      });
    });

    it("updates categoryExplanation regardless of context lookup result", async () => {
      const reason = "Reorganising inbox";

      await service.overrideCategory(userId, emailId, newCategory, reason);

      expect(mockEmailThreadRepository.update).toHaveBeenCalledWith(
        { id: threadId },
        expect.objectContaining({
          categoryExplanation: expect.stringContaining(reason),
        }),
      );
    });

    it("saves a CategoryOverride record with resolved original category name", async () => {
      await service.overrideCategory(userId, emailId, newCategory);

      expect(mockCategoryOverrideRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          emailThreadId: threadId,
          userId,
          originalCategory: "Customer Support",
          userCategory: newCategory,
        }),
      );
      expect(mockCategoryOverrideRepository.save).toHaveBeenCalled();
    });

    it("stores null as originalCategory when thread has no categoryId", async () => {
      mockEmailThreadRepository.findOne.mockResolvedValue({
        ...mockThread,
        categoryId: null,
      });

      await service.overrideCategory(userId, emailId, newCategory);

      expect(mockCategoryOverrideRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          originalCategory: null,
        }),
      );
    });

    it("enqueues a generate-category-rule job for the chosen category (build-rule-on-correction)", async () => {
      await service.overrideCategory(userId, emailId, newCategory);

      const ruleJobCall = mockBoss.send.mock.calls.find(
        (call) => call[0] === JOB_NAMES.GENERATE_CATEGORY_RULE,
      );
      expect(ruleJobCall).toBeDefined();
      expect(ruleJobCall?.[1]).toMatchObject({
        userId,
        emailId,
        categoryName: newCategory,
      });
      // No prior rule mis-filed it (categorySource unset) — no demotion target.
      expect(ruleJobCall?.[1]).not.toHaveProperty("demoteCategoryId");
    });

    it("passes demoteCategoryId when the thread was previously categorised by a rule", async () => {
      mockEmailThreadRepository.findOne.mockResolvedValue({
        ...mockThread,
        categorySource: "rule",
      });

      await service.overrideCategory(userId, emailId, newCategory);

      const ruleJobCall = mockBoss.send.mock.calls.find(
        (call) => call[0] === JOB_NAMES.GENERATE_CATEGORY_RULE,
      );
      expect(ruleJobCall?.[1]).toMatchObject({
        categoryName: newCategory,
        demoteCategoryId: oldContextId,
      });
    });

    it("does NOT enqueue a rule-build job when correcting to Other (uncategorised)", async () => {
      await service.overrideCategory(userId, emailId, "Other");

      const ruleJobCall = mockBoss.send.mock.calls.find(
        (call) => call[0] === JOB_NAMES.GENERATE_CATEGORY_RULE,
      );
      expect(ruleJobCall).toBeUndefined();
    });

    it("does not fail the override when the rule-build enqueue rejects", async () => {
      mockBoss.send.mockRejectedValueOnce(new Error("boss down"));

      const result = await service.overrideCategory(
        userId,
        emailId,
        newCategory,
      );

      expect(result).toEqual({
        success: true,
        category: newCategory,
        categoryId: contextId,
      });
    });

    it("throws when email is not found", async () => {
      mockEmailRepository.findOne.mockResolvedValue(null);

      await expect(
        service.overrideCategory(userId, emailId, newCategory),
      ).rejects.toThrow("Email or thread not found");
    });

    it("throws when thread is not found", async () => {
      mockEmailThreadRepository.findOne.mockResolvedValue(null);

      await expect(
        service.overrideCategory(userId, emailId, newCategory),
      ).rejects.toThrow("Thread not found");
    });
  });
});
