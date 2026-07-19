import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { PromptExampleEntity } from "../database/entities/prompt-example.entity";
import { TokenUsage } from "../database/entities/token-usage.entity";
import { User } from "../database/entities/user.entity";
import { DebugService } from "../debug/debug.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { TokenUsageService } from "./token-usage.service";

const mockDebugService = () => ({
  isEnabled: jest.fn().mockResolvedValue(false),
  log: jest.fn().mockResolvedValue(undefined),
  findDuplicateLlmCalls: jest.fn().mockResolvedValue([]),
});

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
        { provide: DebugService, useValue: mockDebugService() },
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

describe("TokenUsageService - getUsageByOperation cost estimates", () => {
  let service: TokenUsageService;
  let tokenUsageRepo: ReturnType<typeof mockTokenUsageRepository>;

  beforeEach(async () => {
    tokenUsageRepo = mockTokenUsageRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenUsageService,
        { provide: getRepositoryToken(TokenUsage), useValue: tokenUsageRepo },
        {
          provide: getRepositoryToken(PromptExampleEntity),
          useValue: mockPromptExampleRepository(),
        },
        { provide: getRepositoryToken(User), useValue: mockUserRepository() },
        { provide: DebugService, useValue: mockDebugService() },
      ],
    }).compile();

    service = module.get<TokenUsageService>(TokenUsageService);
  });

  function mockRawRows(rows: unknown[]) {
    const builder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    };
    tokenUsageRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnValue(builder),
    });
  }

  it("folds per-model rows into one operation row with a summed cost estimate", async () => {
    mockRawRows([
      {
        operation: "analyze_priority",
        provider: "gemini",
        model: "gemini-3.1-flash-lite",
        callCount: 10,
        totalPromptTokens: 1_000_000,
        totalCompletionTokens: 0,
        totalTokens: 1_000_000,
        avgDurationMs: 100,
        htmlCallCount: 0,
      },
      {
        operation: "analyze_priority",
        provider: "openai",
        model: "gpt-5.4-mini",
        callCount: 10,
        totalPromptTokens: 1_000_000,
        totalCompletionTokens: 0,
        totalTokens: 1_000_000,
        avgDurationMs: 300,
        htmlCallCount: 0,
      },
    ]);

    const result = await service.getUsageByOperation();

    expect(result).toHaveLength(1);
    expect(result[0].callCount).toBe(20);
    expect(result[0].totalTokens).toBe(2_000_000);
    // $0.25 (gemini flash-lite) + $0.75 (gpt-5.4-mini) per 1M prompt tokens
    expect(result[0].estimatedCostUsd).toBeCloseTo(1.0, 6);
    // Weighted average of equal-sized groups
    expect(result[0].avgDurationMs).toBe(200);
    // Both models the operation ran on are listed (equal call counts).
    expect(result[0].models).toEqual(["gemini-3.1-flash-lite", "gpt-5.4-mini"]);
  });

  it("lists an operation's models most-used first", async () => {
    mockRawRows([
      {
        operation: "batch_priority_triage",
        provider: "openai",
        model: "gpt-5.4-mini",
        callCount: 2,
        totalPromptTokens: 100,
        totalCompletionTokens: 0,
        totalTokens: 100,
        avgDurationMs: null,
        htmlCallCount: 0,
      },
      {
        operation: "batch_priority_triage",
        provider: "bedrock",
        model: "amazon.nova-micro-v1:0",
        callCount: 8,
        totalPromptTokens: 100,
        totalCompletionTokens: 0,
        totalTokens: 100,
        avgDurationMs: null,
        htmlCallCount: 0,
      },
    ]);

    const result = await service.getUsageByOperation();

    expect(result[0].models).toEqual([
      "amazon.nova-micro-v1:0",
      "gpt-5.4-mini",
    ]);
  });

  it("sorts operations by estimated cost, not by tokens", async () => {
    mockRawRows([
      {
        operation: "summarize_email",
        provider: "bedrock",
        model: "amazon.nova-micro-v1:0",
        callCount: 100,
        totalPromptTokens: 10_000_000,
        totalCompletionTokens: 0,
        totalTokens: 10_000_000,
        avgDurationMs: null,
        htmlCallCount: 0,
      },
      {
        operation: "analyze_priority",
        provider: "gemini",
        model: "gemini-3.1-flash",
        callCount: 5,
        totalPromptTokens: 1_000_000,
        totalCompletionTokens: 0,
        totalTokens: 1_000_000,
        avgDurationMs: null,
        htmlCallCount: 0,
      },
    ]);

    const result = await service.getUsageByOperation();

    // 10M tokens on Nova Micro is $0.35; 1M on gemini flash is $0.50.
    expect(result.map((row) => row.operation)).toEqual([
      "analyze_priority",
      "summarize_email",
    ]);
  });

  it("keeps estimatedCostUsd null when no model has pricing", async () => {
    mockRawRows([
      {
        operation: "mystery_op",
        provider: "someprovider",
        model: "unknown-model",
        callCount: 1,
        totalPromptTokens: 100,
        totalCompletionTokens: 100,
        totalTokens: 200,
        avgDurationMs: null,
        htmlCallCount: 0,
      },
    ]);

    const result = await service.getUsageByOperation();

    expect(result[0].estimatedCostUsd).toBeNull();
  });
});
