import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { PRIORITY_SCORES } from "../constants/priority-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { GitHubCategoryOverrideService } from "../github/github-category-override.service";
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { UsersService } from "../users/users.service";
import { BackgroundSummaryQueueService } from "./background-summary-queue.service";
import { buildHonestCategoryExplanation } from "./category-explanation.helper";
import { LLMPriorityResultService } from "./llm-priority-result.service";
import { calculateScoreContributions } from "./score-contributions.helper";

/**
 * Chainable mock for the update query builder used by
 * updateThreadCategoryWithPrecedence. Captures the `.set()` payload so tests
 * can assert on the guarded category write.
 */
function makeUpdateQueryBuilderMock() {
  const builder = {
    update: jest.fn(),
    set: jest.fn(),
    andWhere: jest.fn(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  builder.update.mockReturnValue(builder);
  builder.set.mockReturnValue(builder);
  builder.andWhere.mockReturnValue(builder);
  return builder;
}

type ServiceWithPrivate = LLMPriorityResultService & {
  maybeApplyEmergencyDelivery: (args: {
    emailThreadId: string;
    userId: string;
    finalScore: number;
    starCount: number;
    isBatched: boolean;
    urgencyScore: number;
  }) => Promise<void>;
};

describe("LLMPriorityResultService - maybeApplyEmergencyDelivery", () => {
  let service: ServiceWithPrivate;
  let emailThreadRepository: jest.Mocked<Repository<EmailThread>>;
  let backgroundSummaryQueue: {
    queueBackgroundSummary: jest.Mock;
    maybeQueueBackgroundSummary: jest.Mock;
  };

  beforeEach(async () => {
    emailThreadRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
      findOne: jest.fn(),
      createQueryBuilder: jest
        .fn()
        .mockImplementation(() => makeUpdateQueryBuilderMock()),
    } as unknown as jest.Mocked<Repository<EmailThread>>;
    backgroundSummaryQueue = {
      queueBackgroundSummary: jest.fn().mockResolvedValue(undefined),
      maybeQueueBackgroundSummary: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMPriorityResultService,
        {
          provide: getRepositoryToken(Email),
          useValue: {
            update: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
          },
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: emailThreadRepository,
        },
        {
          provide: ProtoCategoriesService,
          useValue: {
            findMatchingProtoCategory: jest.fn().mockResolvedValue(null),
            findMatchingFullCategory: jest.fn().mockResolvedValue(null),
            assignThreadToProtoCategory: jest.fn(),
            createAndAssignToThread: jest.fn(),
          },
        },
        {
          provide: GitHubCategoryOverrideService,
          useValue: {
            resolveOverride: jest.fn().mockResolvedValue({
              categoryId: null,
              matchedKey: null,
              applied: false,
              suppressedReason: null,
            }),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({ githubUsername: null }),
          },
        },
        {
          provide: BackgroundSummaryQueueService,
          useValue: backgroundSummaryQueue,
        },
      ],
    }).compile();

    service = module.get<LLMPriorityResultService>(
      LLMPriorityResultService,
    ) as unknown as ServiceWithPrivate;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("background summary on the LLM path", () => {
    it("always queues the summary (unconditional — not gated on score)", async () => {
      emailThreadRepository.findOne.mockResolvedValue({
        id: "thread-1",
        starCount: 0,
        isBatched: true,
      } as EmailThread);

      await service.applyPriorityResult(
        { id: "email-1", emailThreadId: "thread-1" } as Email,
        {
          urgencyScore: 50,
          urgencyExplanation: "",
          goalAlignmentScore: 0,
          goalAlignmentExplanation: "",
        },
        [],
        "user-1",
        "w1",
      );

      expect(
        backgroundSummaryQueue.queueBackgroundSummary,
      ).toHaveBeenCalledWith({
        userId: "user-1",
        emailId: "email-1",
        threadId: "thread-1",
      });
      expect(
        backgroundSummaryQueue.maybeQueueBackgroundSummary,
      ).not.toHaveBeenCalled();
    });
  });

  describe("non-starred threads", () => {
    it("un-batches when score meets HIGH_THRESHOLD (75)", async () => {
      await service.maybeApplyEmergencyDelivery({
        emailThreadId: "thread-1",
        userId: "user-1",
        finalScore: PRIORITY_SCORES.HIGH_THRESHOLD,
        starCount: 0,
        isBatched: true,
        urgencyScore: 0,
      });

      expect(emailThreadRepository.update).toHaveBeenCalledWith(
        { id: "thread-1", userId: "user-1" },
        expect.objectContaining({
          isBatched: false,
          wasDeliveredEarly: true,
          batchDecisionReason: expect.stringContaining("Emergency delivery"),
        }),
      );
    });

    it("does NOT un-batch when score is below HIGH_THRESHOLD", async () => {
      await service.maybeApplyEmergencyDelivery({
        emailThreadId: "thread-1",
        userId: "user-1",
        finalScore: PRIORITY_SCORES.HIGH_THRESHOLD - 1,
        starCount: 0,
        isBatched: true,
        urgencyScore: 0,
      });

      expect(emailThreadRepository.update).not.toHaveBeenCalled();
    });

    it("un-batches on critical urgency even when the composite score is moderate", async () => {
      await service.maybeApplyEmergencyDelivery({
        emailThreadId: "thread-1",
        userId: "user-1",
        finalScore: 40,
        starCount: 0,
        isBatched: true,
        urgencyScore: PRIORITY_SCORES.CRITICAL_URGENCY_THRESHOLD,
      });

      expect(emailThreadRepository.update).toHaveBeenCalledWith(
        { id: "thread-1", userId: "user-1" },
        expect.objectContaining({
          isBatched: false,
          wasDeliveredEarly: true,
          batchDecisionReason: expect.stringContaining("critical urgency"),
        }),
      );
    });

    it("does NOT un-batch when urgency is just below the critical threshold and score is moderate", async () => {
      await service.maybeApplyEmergencyDelivery({
        emailThreadId: "thread-1",
        userId: "user-1",
        finalScore: 40,
        starCount: 0,
        isBatched: true,
        urgencyScore: PRIORITY_SCORES.CRITICAL_URGENCY_THRESHOLD - 1,
      });

      expect(emailThreadRepository.update).not.toHaveBeenCalled();
    });
  });

  describe("starred threads", () => {
    describe("already delivered (isBatched=false, was visible in Action/Follow-Up)", () => {
      it("does NOT update — thread was already delivered immediately", async () => {
        await service.maybeApplyEmergencyDelivery({
          emailThreadId: "thread-1",
          userId: "user-1",
          finalScore: 90,
          starCount: 1,
          isBatched: false,
          urgencyScore: 0,
        });

        expect(emailThreadRepository.update).not.toHaveBeenCalled();
      });

      it("does NOT update even with critical urgency — already visible", async () => {
        await service.maybeApplyEmergencyDelivery({
          emailThreadId: "thread-1",
          userId: "user-1",
          finalScore: 90,
          starCount: 1,
          isBatched: false,
          urgencyScore: PRIORITY_SCORES.CRITICAL_URGENCY_THRESHOLD,
        });

        expect(emailThreadRepository.update).not.toHaveBeenCalled();
      });
    });

    describe("batched (isBatched=true, was snoozed when email arrived)", () => {
      it("un-batches when score meets HIGH_THRESHOLD (75)", async () => {
        await service.maybeApplyEmergencyDelivery({
          emailThreadId: "thread-1",
          userId: "user-1",
          finalScore: PRIORITY_SCORES.HIGH_THRESHOLD,
          starCount: 1,
          isBatched: true,
          urgencyScore: 0,
        });

        expect(emailThreadRepository.update).toHaveBeenCalledWith(
          { id: "thread-1", userId: "user-1" },
          expect.objectContaining({
            isBatched: false,
            wasDeliveredEarly: true,
            batchDecisionReason: expect.stringContaining("Emergency delivery"),
          }),
        );
      });

      it("does NOT un-batch when score is below HIGH_THRESHOLD (74)", async () => {
        await service.maybeApplyEmergencyDelivery({
          emailThreadId: "thread-1",
          userId: "user-1",
          finalScore: PRIORITY_SCORES.HIGH_THRESHOLD - 1,
          starCount: 1,
          isBatched: true,
          urgencyScore: 0,
        });

        expect(emailThreadRepository.update).not.toHaveBeenCalled();
      });

      it("does NOT un-batch when score is at MEDIUM_THRESHOLD (50) — below urgent threshold", async () => {
        await service.maybeApplyEmergencyDelivery({
          emailThreadId: "thread-1",
          userId: "user-1",
          finalScore: PRIORITY_SCORES.MEDIUM_THRESHOLD,
          starCount: 2,
          isBatched: true,
          urgencyScore: 0,
        });

        expect(emailThreadRepository.update).not.toHaveBeenCalled();
      });

      it("does NOT un-batch at score 60 — same threshold as non-starred (both need HIGH_THRESHOLD)", async () => {
        await service.maybeApplyEmergencyDelivery({
          emailThreadId: "thread-starred-batched",
          userId: "user-1",
          finalScore: 60,
          starCount: 1,
          isBatched: true,
          urgencyScore: 0,
        });
        expect(emailThreadRepository.update).not.toHaveBeenCalled();

        await service.maybeApplyEmergencyDelivery({
          emailThreadId: "thread-unstarred",
          userId: "user-1",
          finalScore: 60,
          starCount: 0,
          isBatched: true,
          urgencyScore: 0,
        });
        expect(emailThreadRepository.update).not.toHaveBeenCalled();
      });
    });
  });

  describe("calculateScoreContributions", () => {
    it("weights urgency at 0.8 around the neutral point (50)", () => {
      const contributions = calculateScoreContributions({
        urgencyScore: 90,
        urgencyExplanation: "",
        goalAlignmentScore: 50,
        goalAlignmentExplanation: "",
      });

      // urgency: (90 − 50) × 0.8; goal alignment: 50 × 0.4
      expect(contributions.urgencyContribution).toBe(32);
      expect(contributions.goalAlignmentContribution).toBe(20);
    });

    it("penalises low urgency symmetrically", () => {
      const contributions = calculateScoreContributions({
        urgencyScore: 10,
        urgencyExplanation: "",
        goalAlignmentScore: 0,
        goalAlignmentExplanation: "",
      });

      // (10 − 50) × 0.8
      expect(contributions.urgencyContribution).toBe(-32);
    });

    it("lets a critically urgent + goal-aligned email reach the emergency threshold", () => {
      const contributions = calculateScoreContributions({
        urgencyScore: 100,
        urgencyExplanation: "",
        goalAlignmentScore: 90,
        goalAlignmentExplanation: "",
      });

      const total =
        contributions.urgencyContribution +
        contributions.goalAlignmentContribution;
      expect(total).toBeGreaterThanOrEqual(PRIORITY_SCORES.HIGH_THRESHOLD);
    });
  });

  describe("buildHonestCategoryExplanation", () => {
    it("names the AI-suggested category when routed to a proto", () => {
      const result = buildHonestCategoryExplanation({
        explanation: "Looks like a QA notification.",
        finalCategory: "Other",
        categoryId: null,
        protoCategoryId: "proto-1",
        protoSuggestedName: "QA Passed",
      });
      expect(result).toContain("Looks like a QA notification.");
      expect(result).toContain('"QA Passed"');
      expect(result).toContain("pending promotion");
      expect(result).not.toContain("not found in your category list");
    });

    it("falls back to a generic proto note when no name is known", () => {
      const result = buildHonestCategoryExplanation({
        explanation: null,
        finalCategory: "Other",
        categoryId: null,
        protoCategoryId: "proto-1",
        protoSuggestedName: null,
      });
      expect(result).toContain("an AI-suggested category");
      expect(result).toContain("pending promotion");
    });

    it("still warns when a non-proto category is unresolved", () => {
      const result = buildHonestCategoryExplanation({
        explanation: "Picked QA Passed.",
        finalCategory: "QA Passed",
        categoryId: null,
        protoCategoryId: null,
      });
      expect(result).toContain("not found in your category list");
    });

    it("returns the explanation unchanged when the category resolved", () => {
      const result = buildHonestCategoryExplanation({
        explanation: "Picked QA Passed.",
        finalCategory: "QA Passed",
        categoryId: "ctx-1",
        protoCategoryId: null,
      });
      expect(result).toBe("Picked QA Passed.");
    });
  });
});

describe("LLMPriorityResultService - resolveCategoryAndProtoCategory", () => {
  let service: LLMPriorityResultService;
  let protoCategoriesService: { findMatchingProtoCategory: jest.Mock };

  const githubPrCategory = {
    contextId: "ctx-gh-pr",
    contextKey: ContextKey.EMAIL_CATEGORY,
    contextValue: "GitHub PR Updates - PR status notifications",
  } as unknown as UserContext;

  beforeEach(async () => {
    protoCategoriesService = {
      findMatchingProtoCategory: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMPriorityResultService,
        {
          provide: getRepositoryToken(Email),
          useValue: { update: jest.fn() },
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: { update: jest.fn(), findOne: jest.fn() },
        },
        { provide: ProtoCategoriesService, useValue: protoCategoriesService },
        {
          provide: GitHubCategoryOverrideService,
          useValue: {
            resolveOverride: jest.fn().mockResolvedValue({
              categoryId: null,
              matchedKey: null,
              applied: false,
              suppressedReason: null,
            }),
          },
        },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        {
          provide: BackgroundSummaryQueueService,
          useValue: {
            queueBackgroundSummary: jest.fn(),
            maybeQueueBackgroundSummary: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(LLMPriorityResultService);
  });

  afterEach(() => jest.clearAllMocks());

  it("keeps the LLM category and skips proto-matching when it resolves to a real category", async () => {
    const result = await service.resolveCategoryAndProtoCategory({
      email: { id: "email-1", emailThreadId: "thread-1" } as Email,
      thread: { protoCategoryId: null } as EmailThread,
      llmResult: { category: "GitHub PR Updates" } as never,
      userId: "user-1",
      workerId: "w1",
      knownCategoryNames: [
        "GitHub PR Updates",
        "New GitHub issues (bot-created)",
      ],
      contexts: [githubPrCategory],
    });

    expect(
      protoCategoriesService.findMatchingProtoCategory,
    ).not.toHaveBeenCalled();
    expect(result.finalCategory).toBe("GitHub PR Updates");
    expect(result.categoryId).toBe("ctx-gh-pr");
    expect(result.protoCategoryId).toBeNull();
  });

  it("attempts proto-matching when the LLM category is not a known real category", async () => {
    await service.resolveCategoryAndProtoCategory({
      email: { id: "email-1", emailThreadId: "thread-1" } as Email,
      thread: { protoCategoryId: null } as EmailThread,
      llmResult: { category: "Some Brand New Topic" } as never,
      userId: "user-1",
      workerId: "w1",
      knownCategoryNames: [],
      contexts: [githubPrCategory],
    });

    expect(
      protoCategoriesService.findMatchingProtoCategory,
    ).toHaveBeenCalledWith("user-1", "Some Brand New Topic");
  });

  it("does NOT proto-match a HIGH-confidence pick whose name doesn't resolve (leaves it Other, not mis-bucketed)", async () => {
    const result = await service.resolveCategoryAndProtoCategory({
      email: { id: "email-1", emailThreadId: "thread-1" } as Email,
      thread: { protoCategoryId: null } as EmailThread,
      llmResult: {
        category: "Some Brand New Topic",
        categoryConfidence: "HIGH",
      } as never,
      userId: "user-1",
      workerId: "w1",
      knownCategoryNames: [],
      contexts: [githubPrCategory],
    });

    expect(
      protoCategoriesService.findMatchingProtoCategory,
    ).not.toHaveBeenCalled();
    expect(result.categoryId).toBeNull();
  });

  it("uses the matched rule's categoryId when its category NAME no longer resolves (renamed), instead of falling to Other", async () => {
    // Models the bug: a rule matched and set the (now-renamed) name, but its
    // categoryId still points to a live category. Name lookup misses; the
    // rule's id rescues it rather than dropping to Other + proto-matching.
    const renamedCategory = {
      contextId: "ctx-status",
      contextKey: ContextKey.EMAIL_CATEGORY,
      contextValue: "🐛 Human GitHub issue status updates - GitHub bug status",
    } as unknown as UserContext;

    const result = await service.resolveCategoryAndProtoCategory({
      email: { id: "email-1", emailThreadId: "thread-1" } as Email,
      thread: { protoCategoryId: null } as EmailThread,
      llmResult: {
        category: "🐛 Human GitHub bug reports",
        ruleCategoryId: "ctx-status",
      } as never,
      userId: "user-1",
      workerId: "w1",
      knownCategoryNames: ["🐛 Human GitHub issue status updates"],
      contexts: [renamedCategory],
    });

    expect(result.categoryId).toBe("ctx-status");
    expect(result.finalCategory).toBe("🐛 Human GitHub issue status updates");
    expect(result.protoCategoryId).toBeNull();
    expect(
      protoCategoriesService.findMatchingProtoCategory,
    ).not.toHaveBeenCalled();
  });

  it("falls through to proto-matching when the rule's categoryId is orphaned (category deleted)", async () => {
    await service.resolveCategoryAndProtoCategory({
      email: { id: "email-1", emailThreadId: "thread-1" } as Email,
      thread: { protoCategoryId: null } as EmailThread,
      llmResult: {
        category: "Deleted Category",
        ruleCategoryId: "ctx-gone",
      } as never,
      userId: "user-1",
      workerId: "w1",
      knownCategoryNames: [],
      contexts: [githubPrCategory],
    });

    // ctx-gone is not in contexts → no rescue → proto-match attempted as before.
    expect(
      protoCategoriesService.findMatchingProtoCategory,
    ).toHaveBeenCalledWith("user-1", "Deleted Category");
  });
});
