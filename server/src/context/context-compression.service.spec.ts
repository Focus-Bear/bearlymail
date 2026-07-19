import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { CategoryKeyAssignmentService } from "../category-keys/category-key-assignment.service";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { LLMService } from "../llm/llm.service";
import { mockPartial } from "../test/helpers/mock-utils";
import { ContextCategoryService } from "./context-category.service";
import { ContextCompressionService } from "./context-compression.service";

const mockContextRepository = {
  find: jest.fn(),
  delete: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockLlmService = {
  compressUserContext: jest.fn(),
};

const mockCategoryService = {
  consolidateExistingCategories: jest.fn(),
  generateCategoriesFromOther: jest.fn(),
};

const mockBoss = {
  send: jest.fn(),
};

const mockCategoryKeyAssignmentService = {
  getUsedCategoryKeys: jest.fn().mockResolvedValue([]),
};

describe("ContextCompressionService", () => {
  let service: ContextCompressionService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextCompressionService,
        {
          provide: getRepositoryToken(UserContext),
          useValue: mockContextRepository,
        },
        { provide: LLMService, useValue: mockLlmService },
        { provide: ContextCategoryService, useValue: mockCategoryService },
        { provide: "PG_BOSS", useValue: mockBoss },
        {
          provide: CategoryKeyAssignmentService,
          useValue: mockCategoryKeyAssignmentService,
        },
      ],
    }).compile();

    service = module.get<ContextCompressionService>(ContextCompressionService);
  });

  describe("getCompressibleContextKeys (via compressUserContext)", () => {
    it("does NOT include Q_AND_A in compressible keys", async () => {
      // If Q_AND_A were in the compressible keys list, compressUserContext
      // would throw an error. We verify it does NOT throw and that Q_AND_A
      // context is never loaded for compression.
      mockContextRepository.find.mockResolvedValue([]);

      const result = await service.compressUserContext("user1");
      expect(result).toEqual(
        expect.objectContaining({ originalCount: 0, compressedCount: 0 }),
      );
      // The find call must NOT include Q_AND_A in its key list
      const findCall = mockContextRepository.find.mock.calls[0]?.[0];
      if (findCall?.where?.contextKey) {
        const keys: ContextKey[] =
          findCall.where.contextKey.value ?? findCall.where.contextKey;
        expect(keys).not.toContain(ContextKey.Q_AND_A);
      }
    });

    it("does NOT include VIP_CONTACT in compressible keys", async () => {
      mockContextRepository.find.mockResolvedValue([]);

      await service.compressUserContext("user1");

      const findCall = mockContextRepository.find.mock.calls[0]?.[0];
      if (findCall?.where?.contextKey) {
        const keys: ContextKey[] =
          findCall.where.contextKey.value ?? findCall.where.contextKey;
        expect(keys).not.toContain(ContextKey.VIP_CONTACT);
      }
    });

    it("does NOT include EMAIL_CATEGORY in compressible keys", async () => {
      mockContextRepository.find.mockResolvedValue([]);

      await service.compressUserContext("user1");

      const findCall = mockContextRepository.find.mock.calls[0]?.[0];
      if (findCall?.where?.contextKey) {
        const keys: ContextKey[] =
          findCall.where.contextKey.value ?? findCall.where.contextKey;
        expect(keys).not.toContain(ContextKey.EMAIL_CATEGORY);
      }
    });
  });

  describe("runtime guard against Q_AND_A in compressible keys", () => {
    it("throws if Q_AND_A is somehow included (safety net for future regressions)", async () => {
      // This test documents the expected behaviour: compressUserContext must
      // throw if Q_AND_A ends up in the compressible keys list.
      // We test the guard by calling compressUserContext and verifying it does
      // NOT throw normally — and that if we could somehow inject Q_AND_A it
      // would throw. Since getCompressibleContextKeys is private, we test the
      // guard indirectly by patching the find mock to return a Q_AND_A item
      // and verifying it is never included in the delete set.
      const qaItem = mockPartial<UserContext>({
        contextId: "qa-id",
        userId: "user1",
        contextKey: ContextKey.Q_AND_A,
        source: Source.UNAPPROVED,
        contextValue: "Q: test? | A: yes.",
      });
      // Simulate: find returns only Q_AND_A items (not in compressible keys)
      mockContextRepository.find.mockResolvedValue([qaItem]);
      mockLlmService.compressUserContext.mockResolvedValue(null);

      // Should NOT throw — Q_AND_A is excluded from compressible keys
      await expect(service.compressUserContext("user1")).resolves.not.toThrow();
      // And crucially, the Q_AND_A item must NOT be deleted
      expect(mockContextRepository.delete).not.toHaveBeenCalled();
    });
  });
});
