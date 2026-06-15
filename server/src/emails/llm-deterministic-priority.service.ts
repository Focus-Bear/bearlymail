import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { CategoryRulesService } from "../category-rules/category-rules.service";
import type { CategoryRuleTraceSnapshot } from "../category-rules/category-rules.types";
import { PRIORITY_RULE_SKIP } from "../constants/priority-rule.constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { GitHubCategoryOverrideService } from "../github/github-category-override.service";
import { PriorityRulesService } from "../priority-rules/priority-rules.service";
import { shouldSkipWithRule } from "../priority-rules/priority-rules-skip.helper";
import { UsersService } from "../users/users.service";
import { applyEmergencyDelivery } from "./emergency-delivery.helper";
import { buildRuleEmailMetadata } from "./rule-email-metadata.helper";

const THREAD_ID_PREVIEW_LENGTH = 8;
const METRIC_PRIORITY_RULE_SKIP = "PriorityRuleSkip";

/**
 * Writes a priority result WITHOUT an LLM call (Phase 2 skip path). The score
 * comes from a matched priority rule's band; the category from a matched
 * category rule. GitHub-derived category overrides still win, and emergency
 * delivery still fires, mirroring the LLM path. The thread is tagged
 * `prioritySource = 'rule'` so the miner excludes it from future mining (no
 * self-reinforcement).
 */
@Injectable()
export class LLMDeterministicPriorityService {
  private readonly logger = new Logger(LLMDeterministicPriorityService.name);

  constructor(
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    @Inject(forwardRef(() => GitHubCategoryOverrideService))
    private readonly githubCategoryOverrideService: GitHubCategoryOverrideService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly priorityRulesService: PriorityRulesService,
    private readonly categoryRulesService: CategoryRulesService,
    private readonly cloudWatchService: CloudWatchService,
  ) {}

  /**
   * Single decision+apply entry point for the deterministic skip, shared by the
   * single and batch refine paths. Skips the analyze_priority LLM call when the
   * flag is on, both a priority rule (score) and category rule (category) match,
   * and the email is not in the shadow-sample fraction. Returns true when it
   * handled the email (caller must NOT run the LLM). Never throws.
   */
  async tryHandle(
    userId: string,
    email: Email,
    thread: EmailThread | null,
    workerId: string,
  ): Promise<boolean> {
    if (!PRIORITY_RULE_SKIP.enabled() || !email.emailThreadId || !thread) {
      return false;
    }
    try {
      const emailMetadata = buildRuleEmailMetadata(email);
      const priorityMatch = await this.priorityRulesService.peekMatchingRule(
        userId,
        emailMetadata,
      );
      // Use the trace variant so we can persist what the rule step saw for the
      // category-debug view. It does not increment the category rule's hit count
      // (the skip path counts only the priority-rule hit), preserving behaviour.
      const categoryTrace = priorityMatch
        ? await this.categoryRulesService.peekMatchingRuleWithTrace(
            userId,
            emailMetadata,
          )
        : null;
      const skip = shouldSkipWithRule({
        skipEnabled: true,
        priorityMatch,
        categoryMatch: categoryTrace?.match ?? null,
        sampleRoll: Math.random(),
        sampleRate: PRIORITY_RULE_SKIP.shadowSampleRate(),
      });
      if (!skip || !priorityMatch || !categoryTrace?.match) {
        return false;
      }
      await this.applyDeterministicPriority({
        email,
        thread,
        representativeScore: priorityMatch.representativeScore,
        categoryMatch: {
          categoryName: categoryTrace.match.categoryName,
          categoryId: categoryTrace.match.categoryId,
        },
        categoryRuleTrace: categoryTrace.snapshot,
        userId,
        workerId,
      });
      await this.priorityRulesService.recordHit(priorityMatch.ruleId);
      await this.cloudWatchService.putMetric(METRIC_PRIORITY_RULE_SKIP, 1);
      this.logger.log(
        `[Worker ${workerId}] Skipped analyze_priority via rule ${priorityMatch.ruleId} (band=${priorityMatch.band}) for email ${email.id}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `[Worker ${workerId}] Deterministic priority skip failed for email ${email.id}; falling back to LLM`,
        error,
      );
      return false;
    }
  }

  async applyDeterministicPriority(args: {
    email: Email;
    thread: EmailThread;
    representativeScore: number;
    categoryMatch: { categoryName: string; categoryId: string | null };
    categoryRuleTrace?: CategoryRuleTraceSnapshot | null;
    userId: string;
    workerId: string;
  }): Promise<void> {
    const {
      email,
      thread,
      representativeScore,
      categoryMatch,
      categoryRuleTrace,
      userId,
      workerId,
    } = args;
    const emailThreadId = email.emailThreadId as string;

    const user = await this.usersService.findOne(userId);
    const githubUsername = user?.githubUsername ?? null;
    const githubOverrideCategoryId =
      await this.githubCategoryOverrideService.resolveOverrideCategoryId(
        userId,
        thread.githubMetadata?.links,
        githubUsername,
      );
    const categoryId = githubOverrideCategoryId ?? categoryMatch.categoryId;

    const priorityExplanation = {
      score: representativeScore,
      breakdown: [
        {
          factor: "⚡ Deterministic rule",
          value: representativeScore,
          description: `Priority set by a learned rule (category "${categoryMatch.categoryName}")`,
        },
      ],
      dimensions: {
        urgency: { score: 0, reasons: ["Set by deterministic priority rule"] },
        goalAlignment: { score: 0, reasons: [] },
        vipContact: { score: 0, reasons: [] },
        sentiment: { score: 0, type: "neutral", reasons: [] },
      },
      calculatedAt: new Date().toISOString(),
    };

    await this.emailThreadRepository.update(
      { id: emailThreadId },
      {
        priorityScore: representativeScore,
        prioritySource: "rule" as const,
        priorityExplanation,
        ...(categoryId !== null && categoryId !== undefined
          ? { categoryId }
          : {}),
        categoryExplanation: `Deterministic priority+category rule (category "${categoryMatch.categoryName}")`,
        categorySource: "priority" as const,
        ...(categoryRuleTrace !== undefined ? { categoryRuleTrace } : {}),
        isProcessingPriority: false,
        aiProcessingDeferred: false,
      },
    );

    await applyEmergencyDelivery(this.emailThreadRepository, {
      emailThreadId,
      userId,
      finalScore: representativeScore,
      starCount: thread.starCount ?? 0,
      isBatched: thread.isBatched ?? true,
    });

    this.logger.log(
      `[Worker ${workerId}] Deterministic priority applied to thread ${emailThreadId.substring(0, THREAD_ID_PREVIEW_LENGTH)}... score=${representativeScore} (LLM skipped)`,
    );
  }
}
