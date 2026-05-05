import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { PromptExampleEntity } from "../database/entities/prompt-example.entity";
import { TokenUsage } from "../database/entities/token-usage.entity";
import { User } from "../database/entities/user.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { TokenUsageService } from "./token-usage.service";

const mockTokenUsageRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockPromptExampleRepository = () => ({
  find: jest.fn().mockResolvedValue([]),
  save: jest.fn(),
  clear: jest.fn(),
});

const mockUserRepository = () => ({
  createQueryBuilder: jest.fn(),
});

describe("TokenUsageService - getUsageByUser", () => {
  let service: TokenUsageService;
  let tokenUsageRepo: ReturnType<typeof mockTokenUsageRepository>;
  let userRepo: ReturnType<typeof mockUserRepository>;

  beforeEach(async () => {
    tokenUsageRepo = mockTokenUsageRepository();
    userRepo = mockUserRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenUsageService,
        {
          provide: getRepositoryToken(TokenUsage),
          useValue: tokenUsageRepo,
        },
        {
          provide: getRepositoryToken(PromptExampleEntity),
          useValue: mockPromptExampleRepository(),
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepo,
        },
      ],
    }).compile();

    service = module.get<TokenUsageService>(TokenUsageService);
  });

  it("returns empty array when no usage rows exist", async () => {
    const selectMock = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    tokenUsageRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnValue(selectMock),
    });

    const result = await service.getUsageByUser();

    expect(result).toEqual([]);
  });

  it("returns top users with emails resolved", async () => {
    const rawRows = [
      {
        userId: "user-1",
        callCount: 50,
        totalPromptTokens: 10000,
        totalCompletionTokens: 5000,
        totalTokens: 15000,
      },
      {
        userId: "user-2",
        callCount: 20,
        totalPromptTokens: 4000,
        totalCompletionTokens: 2000,
        totalTokens: 6000,
      },
    ];

    const selectMock = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rawRows),
    };
    tokenUsageRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnValue(selectMock),
    });

    // Mock users with decrypted emails (TypeORM transformer handles decryption)
    const userSelectMock = {
      select: jest.fn().mockReturnThis(),
      whereInIds: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: "user-1", email: "alice@example.com" },
        { id: "user-2", email: "bob@example.com" },
      ]),
    };
    userRepo.createQueryBuilder.mockReturnValue(userSelectMock);

    const result = await service.getUsageByUser();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      userId: "user-1",
      userEmail: "alice@example.com",
      callCount: 50,
      totalTokens: 15000,
    });
    expect(result[1]).toMatchObject({
      userId: "user-2",
      userEmail: "bob@example.com",
      callCount: 20,
      totalTokens: 6000,
    });
  });

  it("uses null for userEmail when user not found in users table", async () => {
    const rawRows = [
      {
        userId: "unknown-user",
        callCount: 5,
        totalPromptTokens: 1000,
        totalCompletionTokens: 500,
        totalTokens: 1500,
      },
    ];

    const selectMock = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rawRows),
    };
    tokenUsageRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnValue(selectMock),
    });

    const userSelectMock = {
      select: jest.fn().mockReturnThis(),
      whereInIds: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    userRepo.createQueryBuilder.mockReturnValue(userSelectMock);

    const result = await service.getUsageByUser();

    expect(result).toHaveLength(1);
    expect(result[0].userEmail).toBeNull();
    expect(result[0].userId).toBe("unknown-user");
  });

  it("applies startDate filter when provided", async () => {
    const selectMock = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    tokenUsageRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnValue(selectMock),
    });

    const startDate = new Date("2026-01-01");
    await service.getUsageByUser({ startDate });

    expect(selectMock.andWhere).toHaveBeenCalledWith(
      "tu.createdAt >= :startDate",
      expect.objectContaining({ startDate }),
    );
  });

  it("ignores EncryptionHelper import (no circular dep)", () => {
    // Just verifies the service was constructed without encryption helper
    // — email decryption is handled transparently by TypeORM transformers on User entity
    expect(EncryptionHelper).toBeDefined();
    expect(service).toBeDefined();
  });
});
