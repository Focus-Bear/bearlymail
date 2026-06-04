import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { CategoryRulesService } from "../category-rules/category-rules.service";
import { PRIORITY_SCORES } from "../constants/priority-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { GitHubCategoryOverrideService } from "../github/github-category-override.service";
import { PriorityRulesService } from "../priority-rules/priority-rules.service";
import { UsersService } from "../users/users.service";
import { LLMDeterministicPriorityService } from "./llm-deterministic-priority.service";

describe("LLMDeterministicPriorityService - applyDeterministicPriority", () => {
  let service: LLMDeterministicPriorityService;
  let emailThreadRepository: jest.Mocked<Repository<EmailThread>>;
  let githubOverride: { resolveOverrideCategoryId: jest.Mock };
  let priorityRules: { peekMatchingRule: jest.Mock; recordHit: jest.Mock };
  let categoryRules: { peekMatchingRule: jest.Mock };

  const email = { id: "email-1", emailThreadId: "thread-1" } as Email;
  const thread = {
    id: "thread-1",
    starCount: 0,
    isBatched: true,
  } as EmailThread;

  beforeEach(async () => {
    emailThreadRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<EmailThread>>;
    githubOverride = {
      resolveOverrideCategoryId: jest.fn().mockResolvedValue(null),
    };
    priorityRules = {
      peekMatchingRule: jest.fn(),
      recordHit: jest.fn(),
    };
    categoryRules = { peekMatchingRule: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMDeterministicPriorityService,
        {
          provide: getRepositoryToken(EmailThread),
          useValue: emailThreadRepository,
        },
        { provide: GitHubCategoryOverrideService, useValue: githubOverride },
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({ githubUsername: null }),
          },
        },
        { provide: PriorityRulesService, useValue: priorityRules },
        { provide: CategoryRulesService, useValue: categoryRules },
        { provide: CloudWatchService, useValue: { putMetric: jest.fn() } },
      ],
    }).compile();
    service = module.get(LLMDeterministicPriorityService);
  });

  const apply = (
    representativeScore: number,
    categoryId: string | null = "cat-1",
  ) =>
    service.applyDeterministicPriority({
      email,
      thread,
      representativeScore,
      categoryMatch: { categoryName: "Newsletters", categoryId },
      userId: "user-1",
      workerId: "w1",
    });

  it("writes the rule score, tags prioritySource='rule', and sets the category", async () => {
    // LOW_THRESHOLD (25) is below HIGH, so emergency delivery does not fire.
    await apply(PRIORITY_SCORES.LOW_THRESHOLD);
    expect(emailThreadRepository.update).toHaveBeenCalledTimes(1);
    expect(emailThreadRepository.update).toHaveBeenCalledWith(
      { id: "thread-1" },
      expect.objectContaining({
        priorityScore: PRIORITY_SCORES.LOW_THRESHOLD,
        prioritySource: "rule",
        categoryId: "cat-1",
        isProcessingPriority: false,
      }),
    );
  });

  it("lets a GitHub override win over the category rule's category", async () => {
    githubOverride.resolveOverrideCategoryId.mockResolvedValue("gh-cat");
    await apply(35, "cat-1");
    expect(emailThreadRepository.update).toHaveBeenCalledWith(
      { id: "thread-1" },
      expect.objectContaining({ categoryId: "gh-cat" }),
    );
  });

  it("fires emergency delivery when the band score is high", async () => {
    // HIGH (80) ≥ HIGH_THRESHOLD (75): first update writes priority, second
    // un-batches for emergency delivery.
    await apply(PRIORITY_SCORES.HIGH);
    expect(emailThreadRepository.update).toHaveBeenCalledTimes(2);
    expect(emailThreadRepository.update).toHaveBeenLastCalledWith(
      { id: "thread-1", userId: "user-1" },
      expect.objectContaining({ isBatched: false, wasDeliveredEarly: true }),
    );
  });

  describe("tryHandle", () => {
    const priorityMatch = {
      ruleId: "p1",
      band: "low",
      representativeScore: 35,
    };
    const categoryMatch = {
      categoryName: "Newsletters",
      categoryId: "c1",
      ruleId: "r1",
      ruleType: null,
      ruleKind: "composite",
    };
    let randomSpy: jest.SpyInstance;
    const envBefore = process.env.PRIORITY_RULE_SKIP_ENABLED;

    beforeEach(() => {
      // Unset = default ON; 0.99 roll is above the sample rate (not sampled).
      delete process.env.PRIORITY_RULE_SKIP_ENABLED;
      randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.99);
    });
    afterEach(() => {
      randomSpy.mockRestore();
      process.env.PRIORITY_RULE_SKIP_ENABLED = envBefore;
    });

    const run = () => service.tryHandle("user-1", email, thread, "w1");

    it("skips + applies when both rules match and not sampled", async () => {
      priorityRules.peekMatchingRule.mockResolvedValue(priorityMatch);
      categoryRules.peekMatchingRule.mockResolvedValue(categoryMatch);
      expect(await run()).toBe(true);
      expect(emailThreadRepository.update).toHaveBeenCalledWith(
        { id: "thread-1" },
        expect.objectContaining({ priorityScore: 35, prioritySource: "rule" }),
      );
      expect(priorityRules.recordHit).toHaveBeenCalledWith("p1");
    });

    it("does not skip when there is no priority rule", async () => {
      priorityRules.peekMatchingRule.mockResolvedValue(null);
      expect(await run()).toBe(false);
      expect(categoryRules.peekMatchingRule).not.toHaveBeenCalled();
      expect(emailThreadRepository.update).not.toHaveBeenCalled();
    });

    it("does not skip when there is no category rule", async () => {
      priorityRules.peekMatchingRule.mockResolvedValue(priorityMatch);
      categoryRules.peekMatchingRule.mockResolvedValue(null);
      expect(await run()).toBe(false);
      expect(emailThreadRepository.update).not.toHaveBeenCalled();
    });

    it("falls through to the LLM when shadow-sampled", async () => {
      // A 0.0 roll lands inside the shadow-sample fraction.
      randomSpy.mockReturnValue(0.0);
      priorityRules.peekMatchingRule.mockResolvedValue(priorityMatch);
      categoryRules.peekMatchingRule.mockResolvedValue(categoryMatch);
      expect(await run()).toBe(false);
      expect(emailThreadRepository.update).not.toHaveBeenCalled();
    });

    it("does not skip when the kill switch is set", async () => {
      process.env.PRIORITY_RULE_SKIP_ENABLED = "false";
      priorityRules.peekMatchingRule.mockResolvedValue(priorityMatch);
      categoryRules.peekMatchingRule.mockResolvedValue(categoryMatch);
      expect(await run()).toBe(false);
      expect(priorityRules.peekMatchingRule).not.toHaveBeenCalled();
    });
  });
});
