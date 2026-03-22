import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { CategoryOverride } from "../database/entities/category-override.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
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
  findOne: jest.fn(),
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

  describe("overrideCategory", () => {
    const userId = "user-uuid-1";
    const emailId = "email-uuid-1";
    const threadId = "thread-uuid-1";
    const newCategory = "Newsletters";
    const contextId = "context-uuid-1";

    const mockEmail = { id: emailId, userId, emailThreadId: threadId };
    const mockThread = {
      id: threadId,
      userId,
      category: "Customer Support",
      categoryId: "old-context-uuid",
    };
    const mockOverride = { id: "override-uuid-1" };
    const mockContext: Partial<UserContext> = {
      contextId,
      userId,
      contextKey: ContextKey.EMAIL_CATEGORY,
      contextValue: newCategory,
    };

    beforeEach(() => {
      mockEmailRepository.findOne.mockResolvedValue(mockEmail);
      mockEmailThreadRepository.findOne.mockResolvedValue(mockThread);
      mockCategoryOverrideRepository.create.mockReturnValue(mockOverride);
      mockCategoryOverrideRepository.save.mockResolvedValue(mockOverride);
      mockEmailThreadRepository.update.mockResolvedValue({ affected: 1 });
    });

    it("sets categoryId when a matching UserContext EMAIL_CATEGORY row exists", async () => {
      mockUserContextRepository.findOne.mockResolvedValue(mockContext);

      const result = await service.overrideCategory(
        userId,
        emailId,
        newCategory,
        "User requested",
      );

      expect(result).toEqual({ success: true, category: newCategory });

      // Verify context lookup used correct params
      expect(mockUserContextRepository.findOne).toHaveBeenCalledWith({
        where: {
          userId,
          contextKey: ContextKey.EMAIL_CATEGORY,
          contextValue: newCategory,
        },
      });

      // Verify thread update includes categoryId from matched context
      expect(mockEmailThreadRepository.update).toHaveBeenCalledWith(
        { id: threadId },
        expect.objectContaining({
          category: newCategory,
          categoryId: contextId,
        }),
      );
    });

    it("does NOT update categoryId when no matching UserContext row exists", async () => {
      mockUserContextRepository.findOne.mockResolvedValue(null);

      const result = await service.overrideCategory(
        userId,
        emailId,
        newCategory,
      );

      expect(result).toEqual({ success: true, category: newCategory });

      // Verify thread update does NOT include categoryId
      const updateCall = mockEmailThreadRepository.update.mock.calls[0];
      const updatePayload = updateCall[1];
      expect(updatePayload).not.toHaveProperty("categoryId");

      // But category name is still updated
      expect(updatePayload).toMatchObject({ category: newCategory });
    });

    it("still updates category name and explanation regardless of context lookup result", async () => {
      mockUserContextRepository.findOne.mockResolvedValue(mockContext);
      const reason = "Reorganising inbox";

      await service.overrideCategory(userId, emailId, newCategory, reason);

      expect(mockEmailThreadRepository.update).toHaveBeenCalledWith(
        { id: threadId },
        expect.objectContaining({
          category: newCategory,
          categoryExplanation: expect.stringContaining(reason),
        }),
      );
    });

    it("saves a CategoryOverride record with original category", async () => {
      mockUserContextRepository.findOne.mockResolvedValue(mockContext);

      await service.overrideCategory(userId, emailId, newCategory);

      expect(mockCategoryOverrideRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          emailThreadId: threadId,
          userId,
          originalCategory: mockThread.category,
          userCategory: newCategory,
        }),
      );
      expect(mockCategoryOverrideRepository.save).toHaveBeenCalled();
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
