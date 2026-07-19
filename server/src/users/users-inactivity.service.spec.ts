import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { DeletedAccount } from "../database/entities/deleted-account.entity";
import { User } from "../database/entities/user.entity";
import { UsersService } from "./users.service";

jest.mock("../encryption/encryption.helper", () => {
  const noopTransformer = {
    to: (value: unknown) => value,
    from: (value: unknown) => value,
  };
  return {
    EncryptionHelper: {
      hashEmail: jest.fn((email: string) => `hash_${email.toLowerCase()}`),
    },
    makeEmailTransformer: () => noopTransformer,
    makeEncryptedColumnTransformer: () => noopTransformer,
    makeEncryptedJsonTransformer: () => noopTransformer,
    makeGlobalEmailTransformer: () => noopTransformer,
    makeGlobalEncryptedColumnTransformer: () => noopTransformer,
    makeGlobalEncryptedJsonTransformer: () => noopTransformer,
  };
});

jest.mock("../auth/auth-logger", () => ({
  writeDebugLog: jest.fn(),
}));

describe("UsersService — inactivity tracking", () => {
  let service: UsersService;
  let repository: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
            query: jest.fn(),
            delete: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(DeletedAccount),
          useValue: {
            findOne: jest.fn(),
            upsert: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get(getRepositoryToken(User));
  });

  describe("updateLastActivity", () => {
    it("updates lastActivityAt to now", async () => {
      repository.update.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });
      await service.updateLastActivity("user-1");
      expect(repository.update).toHaveBeenCalledWith("user-1", {
        lastActivityAt: expect.any(Date),
      });
    });
  });

  describe("isUserActive", () => {
    it("returns true when lastActivityAt is within threshold", async () => {
      // 1 day ago
      const recentActivity = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      repository.findOne.mockResolvedValue({
        id: "user-1",
        lastActivityAt: recentActivity,
      } as User);
      const result = await service.isUserActive("user-1", 3);
      expect(result).toBe(true);
    });

    it("returns false when lastActivityAt exceeds threshold", async () => {
      // 5 days ago
      const oldActivity = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      repository.findOne.mockResolvedValue({
        id: "user-1",
        lastActivityAt: oldActivity,
      } as User);
      const result = await service.isUserActive("user-1", 3);
      expect(result).toBe(false);
    });

    it("returns false when lastActivityAt is null", async () => {
      repository.findOne.mockResolvedValue({
        id: "user-1",
        lastActivityAt: null,
      } as User);
      const result = await service.isUserActive("user-1", 3);
      expect(result).toBe(false);
    });

    it("returns false when user not found", async () => {
      repository.findOne.mockResolvedValue(null);
      const result = await service.isUserActive("user-1", 3);
      expect(result).toBe(false);
    });
  });

  describe("wasUserInactive", () => {
    it("returns true when user is inactive", async () => {
      const oldActivity = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      repository.findOne.mockResolvedValue({
        id: "user-1",
        lastActivityAt: oldActivity,
      } as User);
      const result = await service.wasUserInactive("user-1", 3);
      expect(result).toBe(true);
    });

    it("returns false when user is active", async () => {
      const recentActivity = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      repository.findOne.mockResolvedValue({
        id: "user-1",
        lastActivityAt: recentActivity,
      } as User);
      const result = await service.wasUserInactive("user-1", 3);
      expect(result).toBe(false);
    });
  });

  describe("findOneActivityTimestamp", () => {
    it("returns lastActivityAt when user exists", async () => {
      const ts = new Date("2024-01-10T12:00:00Z");
      repository.findOne.mockResolvedValue({
        id: "user-1",
        lastActivityAt: ts,
      } as User);
      const result = await service.findOneActivityTimestamp("user-1");
      expect(result).toEqual(ts);
    });

    it("returns null when user not found", async () => {
      repository.findOne.mockResolvedValue(null);
      const result = await service.findOneActivityTimestamp("user-1");
      expect(result).toBeNull();
    });
  });
});
