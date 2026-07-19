import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { GitHubRepoMapping } from "../database/entities/github-repo-mapping.entity";
import { GitHubRepoMappingService } from "./github-repo-mapping.service";

describe("GitHubRepoMappingService", () => {
  let service: GitHubRepoMappingService;

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitHubRepoMappingService,
        {
          provide: getRepositoryToken(GitHubRepoMapping),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<GitHubRepoMappingService>(GitHubRepoMappingService);
    jest.clearAllMocks();
  });

  describe("findAllForUser", () => {
    it("should return all mappings for a user", async () => {
      const mockMappings = [
        {
          id: "1",
          userId: "user1",
          owner: "org",
          repo: "repo1",
          isDefault: true,
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-01"),
        },
        {
          id: "2",
          userId: "user1",
          owner: "org",
          repo: "repo2",
          isDefault: false,
          createdAt: new Date("2024-01-02"),
          updatedAt: new Date("2024-01-02"),
        },
      ];
      mockRepository.find.mockResolvedValue(mockMappings);

      const result = await service.findAllForUser("user1");

      expect(result).toHaveLength(2);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { userId: "user1" },
        order: { isDefault: "DESC", createdAt: "ASC" },
      });
    });

    it("should deduplicate mappings with identical owner/repo and delete extras", async () => {
      const mockMappings = [
        {
          id: "1",
          userId: "user1",
          owner: "org",
          repo: "repo1",
          isDefault: true,
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-02"),
        },
        // duplicate
        {
          id: "2",
          userId: "user1",
          owner: "org",
          repo: "repo1",
          isDefault: false,
          createdAt: new Date("2024-01-02"),
          updatedAt: new Date("2024-01-02"),
        },
        {
          id: "3",
          userId: "user1",
          owner: "org",
          repo: "repo2",
          isDefault: false,
          createdAt: new Date("2024-01-03"),
          updatedAt: new Date("2024-01-03"),
        },
      ];
      // find is called with isDefault DESC, createdAt ASC - default first
      mockRepository.find.mockResolvedValue(mockMappings);
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.findAllForUser("user1");

      // Should return 2 unique mappings (id:1 and id:3), deduplicated
      expect(result).toHaveLength(2);
      const ids = result.map((mapping) => mapping.id);
      expect(ids).toContain("1");
      expect(ids).toContain("3");
      expect(ids).not.toContain("2");

      // Should schedule deletion of the duplicate - flush microtasks first
      await Promise.resolve();
      expect(mockRepository.delete).toHaveBeenCalledWith(["2"]);
    });

    it("should keep isDefault mapping when deduplicating", async () => {
      const mockMappings = [
        // isDefault=true comes first (order: isDefault DESC)
        {
          id: "1",
          userId: "user1",
          owner: "org",
          repo: "repo1",
          isDefault: true,
          createdAt: new Date("2024-01-02"),
          updatedAt: new Date("2024-01-02"),
        },
        // duplicate, older but not default
        {
          id: "2",
          userId: "user1",
          owner: "org",
          repo: "repo1",
          isDefault: false,
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-01"),
        },
      ];
      mockRepository.find.mockResolvedValue(mockMappings);
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.findAllForUser("user1");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
      expect(result[0].isDefault).toBe(true);
    });

    it("should handle case-insensitive owner/repo deduplication", async () => {
      const mockMappings = [
        {
          id: "1",
          userId: "user1",
          owner: "Focus-Bear",
          repo: "BearlyMail",
          isDefault: true,
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-01"),
        },
        // same org, different case
        {
          id: "2",
          userId: "user1",
          owner: "focus-bear",
          repo: "bearlymail",
          isDefault: false,
          createdAt: new Date("2024-01-02"),
          updatedAt: new Date("2024-01-02"),
        },
      ];
      mockRepository.find.mockResolvedValue(mockMappings);
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.findAllForUser("user1");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });
  });

  describe("findOneForUser", () => {
    it("should return a single mapping", async () => {
      const mockMapping = {
        id: "1",
        userId: "user1",
        owner: "org",
        repo: "repo1",
      };
      mockRepository.findOne.mockResolvedValue(mockMapping);

      const result = await service.findOneForUser("user1", "1");

      expect(result).toEqual(mockMapping);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: "1", userId: "user1" },
      });
    });

    it("should return null when not found", async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findOneForUser("user1", "nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("create", () => {
    it("should create a new mapping", async () => {
      const newMapping = {
        userId: "user1",
        owner: "org",
        repo: "repo1",
        emailCategories: null,
        context: null,
        isDefault: false,
        isAutoDiscovered: false,
      };
      mockRepository.create.mockReturnValue(newMapping);
      mockRepository.save.mockResolvedValue({ id: "1", ...newMapping });

      const result = await service.create("user1", {
        owner: "org",
        repo: "repo1",
      });

      expect(result).toEqual({ id: "1", ...newMapping });
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it("should clear other defaults when creating a default mapping", async () => {
      const newMapping = {
        userId: "user1",
        owner: "org",
        repo: "repo1",
        emailCategories: null,
        context: null,
        isDefault: true,
        isAutoDiscovered: false,
      };
      mockRepository.create.mockReturnValue(newMapping);
      mockRepository.save.mockResolvedValue({ id: "1", ...newMapping });

      await service.create("user1", {
        owner: "org",
        repo: "repo1",
        isDefault: true,
      });

      expect(mockRepository.update).toHaveBeenCalledWith(
        { userId: "user1", isDefault: true },
        { isDefault: false },
      );
    });
  });

  describe("update", () => {
    it("should update an existing mapping", async () => {
      const existing = {
        id: "1",
        userId: "user1",
        owner: "org",
        repo: "repo1",
        emailCategories: null,
        context: null,
        isDefault: false,
      };
      mockRepository.findOne.mockResolvedValue({ ...existing });
      mockRepository.save.mockResolvedValue({
        ...existing,
        emailCategories: "bugs",
      });

      const result = await service.update("user1", "1", {
        emailCategories: "bugs",
      });

      expect(result).toBeDefined();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it("should return null when mapping not found", async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.update("user1", "nonexistent", {
        emailCategories: "bugs",
      });

      expect(result).toBeNull();
    });

    it("should clear other defaults when setting as default", async () => {
      const existing = {
        id: "1",
        userId: "user1",
        owner: "org",
        repo: "repo1",
        emailCategories: null,
        context: null,
        isDefault: false,
      };
      mockRepository.findOne.mockResolvedValue({ ...existing });
      mockRepository.save.mockResolvedValue({ ...existing, isDefault: true });

      await service.update("user1", "1", { isDefault: true });

      expect(mockRepository.update).toHaveBeenCalledWith(
        { userId: "user1", isDefault: true },
        { isDefault: false },
      );
    });
  });

  describe("remove", () => {
    it("should delete a mapping and return true", async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.remove("user1", "1");

      expect(result).toBe(true);
    });

    it("should return false when nothing deleted", async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 });

      const result = await service.remove("user1", "nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("getDefaultForUser", () => {
    it("should return the default mapping", async () => {
      const defaultMapping = { id: "1", userId: "user1", isDefault: true };
      mockRepository.findOne.mockResolvedValue(defaultMapping);

      const result = await service.getDefaultForUser("user1");

      expect(result).toEqual(defaultMapping);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { userId: "user1", isDefault: true },
      });
    });
  });

  describe("findByCategory", () => {
    it("should find mapping by category", async () => {
      const mappings = [
        {
          id: "1",
          emailCategories: "bugs,features",
          owner: "org",
          repo: "repo1",
        },
        { id: "2", emailCategories: "support", owner: "org", repo: "repo2" },
      ];
      mockRepository.find.mockResolvedValue(mappings);

      const result = await service.findByCategory("user1", "bugs");

      expect(result).toEqual(mappings[0]);
    });

    it("should return null when no category match", async () => {
      const mappings = [
        { id: "1", emailCategories: "bugs", owner: "org", repo: "repo1" },
      ];
      mockRepository.find.mockResolvedValue(mappings);

      const result = await service.findByCategory("user1", "support");

      expect(result).toBeNull();
    });

    it("should be case-insensitive", async () => {
      const mappings = [
        {
          id: "1",
          emailCategories: "Bugs,Features",
          owner: "org",
          repo: "repo1",
        },
      ];
      mockRepository.find.mockResolvedValue(mappings);

      const result = await service.findByCategory("user1", "BUGS");

      expect(result).toEqual(mappings[0]);
    });
  });

  describe("getRepoForEmail", () => {
    it("should return category-matched repo when available", async () => {
      const mapping = {
        id: "1",
        owner: "org",
        repo: "repo1",
        emailCategories: "bugs",
      };
      mockRepository.find.mockResolvedValue([mapping]);

      const result = await service.getRepoForEmail("user1", "bugs");

      expect(result).toEqual({ owner: "org", repo: "repo1" });
    });

    it("should fall back to default repo", async () => {
      mockRepository.find.mockResolvedValue([]);
      const defaultMapping = {
        id: "2",
        owner: "org",
        repo: "default-repo",
        isDefault: true,
      };
      mockRepository.findOne.mockResolvedValue(defaultMapping);

      const result = await service.getRepoForEmail("user1", "unknown-category");

      expect(result).toEqual({ owner: "org", repo: "default-repo" });
    });

    it("should return null when no mappings exist", async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getRepoForEmail("user1", null);

      expect(result).toBeNull();
    });
  });

  describe("autoDiscoverRepo", () => {
    it("should create new mapping for undiscovered repo", async () => {
      // find returns empty list — no existing mapping for this owner/repo
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);
      const newMapping = {
        userId: "user1",
        owner: "org",
        repo: "new-repo",
        isAutoDiscovered: true,
        isDefault: true,
      };
      mockRepository.create.mockReturnValue(newMapping);
      mockRepository.save.mockResolvedValue({ id: "1", ...newMapping });

      const result = await service.autoDiscoverRepo("user1", "org", "new-repo");

      expect(result).toBeDefined();
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isAutoDiscovered: true,
          isDefault: true,
        }),
      );
    });

    it("should set isDefault false when user already has mappings", async () => {
      // find returns empty list — no existing mapping for this specific owner/repo
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(2);
      const newMapping = {
        userId: "user1",
        owner: "org",
        repo: "new-repo",
        isAutoDiscovered: true,
        isDefault: false,
      };
      mockRepository.create.mockReturnValue(newMapping);
      mockRepository.save.mockResolvedValue({ id: "1", ...newMapping });

      await service.autoDiscoverRepo("user1", "org", "new-repo");

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isDefault: false,
        }),
      );
    });

    it("should return existing mapping without changes if already exists", async () => {
      const existing = {
        id: "1",
        userId: "user1",
        owner: "org",
        repo: "repo1",
        emailCategories: "bugs",
      };
      // find returns the existing mapping — owner/repo match in decrypted values
      mockRepository.find.mockResolvedValue([existing]);

      const result = await service.autoDiscoverRepo(
        "user1",
        "org",
        "repo1",
        "bugs",
      );

      expect(result).toEqual(existing);
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it("should append new category to existing mapping", async () => {
      const existing = {
        id: "1",
        userId: "user1",
        owner: "org",
        repo: "repo1",
        emailCategories: "bugs",
      };
      mockRepository.find.mockResolvedValue([existing]);
      mockRepository.save.mockResolvedValue({
        ...existing,
        emailCategories: "bugs,features",
      });

      const result = await service.autoDiscoverRepo(
        "user1",
        "org",
        "repo1",
        "features",
      );

      expect(mockRepository.save).toHaveBeenCalled();
      expect(result?.emailCategories).toBe("bugs,features");
    });

    it("should set category on existing mapping with no categories", async () => {
      const existing = {
        id: "1",
        userId: "user1",
        owner: "org",
        repo: "repo1",
        emailCategories: null,
      };
      mockRepository.find.mockResolvedValue([existing]);
      mockRepository.save.mockResolvedValue({
        ...existing,
        emailCategories: "bugs",
      });

      const result = await service.autoDiscoverRepo(
        "user1",
        "org",
        "repo1",
        "bugs",
      );

      expect(mockRepository.save).toHaveBeenCalled();
      expect(result?.emailCategories).toBe("bugs");
    });

    it("should not create duplicate when repo already exists with different case", async () => {
      const existing = {
        id: "1",
        userId: "user1",
        owner: "Focus-Bear",
        repo: "BearlyMail",
        emailCategories: null,
      };
      // Simulate find returning a mapping that matches after decryption
      mockRepository.find.mockResolvedValue([existing]);

      const result = await service.autoDiscoverRepo(
        "user1",
        "Focus-Bear",
        "BearlyMail",
      );

      // Should return the existing mapping, not create a new one
      expect(result).toEqual(existing);
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });
});
