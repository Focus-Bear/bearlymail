import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { PromptExampleEntity } from "../database/entities/prompt-example.entity";
import { TokenUsage } from "../database/entities/token-usage.entity";
import { User } from "../database/entities/user.entity";
import { DebugService } from "../debug/debug.service";
import { DEBUG_FEATURES } from "../debug/debug-feature-names";
import { TokenUsageService } from "./token-usage.service";

describe("TokenUsageService - LLM call fingerprint", () => {
  let service: TokenUsageService;
  let debug: { isEnabled: jest.Mock; log: jest.Mock };

  const baseUsage = {
    operation: "analyze_priority",
    provider: "gemini",
    model: "gemini-3.1-flash-lite",
    promptTokens: 100,
    completionTokens: 10,
    totalTokens: 110,
    userId: "user-1",
  } as const;

  beforeEach(async () => {
    debug = {
      isEnabled: jest.fn().mockResolvedValue(true),
      log: jest.fn().mockResolvedValue(undefined),
    };
    const module = await Test.createTestingModule({
      providers: [
        TokenUsageService,
        {
          provide: getRepositoryToken(TokenUsage),
          useValue: {
            create: jest.fn((x) => x),
            save: jest.fn().mockResolvedValue({ id: "t1" }),
          },
        },
        {
          provide: getRepositoryToken(PromptExampleEntity),
          useValue: { find: jest.fn().mockResolvedValue([]), save: jest.fn() },
        },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: DebugService, useValue: debug },
      ],
    }).compile();
    service = module.get(TokenUsageService);
  });

  it("logs a content hash + call site when the fingerprint feature is enabled", async () => {
    await service.logUsage({
      ...baseUsage,
      systemPromptText: "RULES",
      promptText: "BODY",
    });

    expect(debug.log).toHaveBeenCalledWith(
      DEBUG_FEATURES.LLM_CALL_FINGERPRINT,
      "user-1",
      expect.objectContaining({
        contentHash: expect.stringMatching(/^[a-f0-9]{32}$/),
        operation: "analyze_priority",
        provider: "gemini",
        callSite: expect.any(String),
      }),
    );
  });

  it("produces identical hashes for identical content (duplicate detection)", async () => {
    await service.logUsage({ ...baseUsage, promptText: "SAME" });
    await service.logUsage({ ...baseUsage, promptText: "SAME" });
    const [, , first] = debug.log.mock.calls[0];
    const [, , second] = debug.log.mock.calls[1];
    expect(first.contentHash).toBe(second.contentHash);
  });

  it("does not fingerprint when the feature is disabled", async () => {
    debug.isEnabled.mockResolvedValue(false);
    await service.logUsage({ ...baseUsage, promptText: "BODY" });
    expect(debug.log).not.toHaveBeenCalled();
  });

  it("does not fingerprint calls without prompt text (e.g. tool-calling)", async () => {
    await service.logUsage(baseUsage);
    expect(debug.isEnabled).not.toHaveBeenCalled();
    expect(debug.log).not.toHaveBeenCalled();
  });
});
