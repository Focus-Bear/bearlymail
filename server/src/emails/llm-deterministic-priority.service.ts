import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { CategoryRulesService } from "../category-rules/category-rules.service";
import type {
  CategoryRuleEvaluationSet,
  CategoryRuleTraceSnapshot,
} from "../category-rules/category-rules.types";
import { PRIORITY_RULE_SKIP } from "../constants/priority-rule.constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { PriorityRule } from "../database/entities/priority-rule.entity";
import { PriorityRulesService } from "../priority-rules/priority-rules.service";
import { shouldSkipWithRule } from "../priority-rules/priority-rules-skip.helper";
import { BackgroundSummaryQueueService } from "./background-summary-queue.service";
import {
  analyzedEmailFromEmail,
  deterministicRuleDecisionTrace,
} from "./category-decision-trace.helper";
import { updateThreadCategoryWithPrecedence } from "./category-precedence.helper";
import { applyEmergencyDelivery } from "./emergency-delivery.helper";
import { buildRuleEmailMetadata } from "./rule-email-metadata.helper";

const THREAD_ID_PREVIEW_LENGTH = 8;
const METRIC_PRIORITY_RULE_SKIP = "PriorityRuleSkip";

/**
 * Rules fetched once per batch so `tryHandle` can evaluate every email in the
 * batch without re-querying (see `loadPreload`).
 */
export interface DeterministicRulePreload {
  priorityRules: PriorityRule[];
  categoryRules: CategoryRuleEvaluationSet;
}

/**
 * Writes a priority result WITHOUT an LLM call (Phase 2 skip path). The score
 * comes from a matched priority rule's band; the category from a matched
 * category rule. Emergency delivery still fires, mirroring the LLM path. The
 * thread is tagged `prioritySource = 'rule'` / `categorySource = 'rule'` so the
 * miner excludes it from future mining (no self-reinforcement) and the
 * precedence guard protects the category from automated re-runs.
 */
@Injectable()
export class LLMDeterministicPriorityService {
  private readonly logger = new Logger(LLMDeterministicPriorityService.name);

  constructor(
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    private readonly priorityRulesService: PriorityRulesService,
    private readonly categoryRulesService: CategoryRulesService,
    private readonly cloudWatchService: CloudWatchService,
    private readonly backgroundSummaryQueueService: BackgroundSummaryQueueService,
  ) {}

  /**
   * Single decision+apply entry point for the deterministic skip, shared by the
   * single and batch refine paths. Skips the analyze_priority LLM call when the
   * flag is on, both a priority rule (score) and category rule (category) match,
   * and the email is not in the shadow-sample fraction. Returns true when it
   * handled the email (caller must NOT run the LLM). Never throws.
   *
   * `preloaded` lets the batch path evaluate every email in a batch from ONE
   * rules+categories fetch instead of three queries per email.
   */
  /**
   * Fetches the rules `tryHandle` evaluates, once, for a whole batch. Returns
   * undefined when the skip flag is off (nothing will be evaluated) or on any
   * fetch error — `tryHandle` then falls back to its own per-email fetch.
   */
  async loadPreload(
    userId: string,
  ): Promise<DeterministicRulePreload | undefined> {
    if (!PRIORITY_RULE_SKIP.enabled()) {
      return undefined;
    }
    try {
      const [priorityRules, categoryRules] = await Promise.all([
        this.priorityRulesService.loadEnabledRules(userId),
        this.categoryRulesService.loadRuleEvaluationSet(userId),
      ]);
      return { priorityRules, categoryRules };
    } catch (error) {
      this.logger.warn(
        `Failed to preload rules for user ${userId} — falling back to per-email fetches`,
        error,
      );
      return undefined;
    }
  }

  async tryHandle(
    userId: string,
    email: Email,
    thread: EmailThread | null,
    workerId: string,
    preloaded?: DeterministicRulePreload,
  ): Promise<boolean> {
    if (!PRIORITY_RULE_SKIP.enabled() || !email.emailThreadId || !thread) {
      return false;
    }
    try {
      const emailMetadata = buildRuleEmailMetadata(email);
      const priorityMatch = await this.priorityRulesService.peekMatchingRule(
        userId,
        emailMetadata,
        preloaded?.priorityRules,
      );
      // Use the trace variant so we can persist what the rule step saw for the
      // category-debug view. It does not increment the category rule's hit count
      // (the skip path counts only the priority-rule hit), preserving behaviour.
      const categoryTrace = priorityMatch
        ? await this.categoryRulesService.peekMatchingRuleWithTrace(
            userId,
            emailMetadata,
            preloaded?.categoryRules,
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

    const { categoryId } = categoryMatch;

    const decisionTrace = deterministicRuleDecisionTrace({
      decidedAt: new Date().toISOString(),
      categoryName: categoryMatch.categoryName,
      ruleCategoryId: categoryMatch.categoryId,
      finalCategoryId: categoryId,
      analyzedEmail: analyzedEmailFromEmail(email, "email-metadata"),
    });

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
        isProcessingPriority: false,
        aiProcessingDeferred: false,
      },
    );

    // Category columns go through the precedence guard: a rule may replace any
    // automated decision but never a user override.
    const applied = await updateThreadCategoryWithPrecedence(
      this.emailThreadRepository,
      {
        where: { id: emailThreadId },
        source: "rule",
        set: {
          ...(categoryId !== null && categoryId !== undefined
            ? { categoryId }
            : {}),
          categoryExplanation: `Deterministic priority+category rule (category "${categoryMatch.categoryName}")`,
          categorySource: "rule" as const,
          ...(categoryRuleTrace !== undefined ? { categoryRuleTrace } : {}),
          categoryDecisionTrace: decisionTrace,
        },
      },
    );
    if (applied === 0) {
      this.logger.log(
        `[Worker ${workerId}] Rule category write blocked by precedence for thread ${emailThreadId} (user override pinned) — priority updated, category kept`,
      );
    }

    await applyEmergencyDelivery(this.emailThreadRepository, {
      emailThreadId,
      userId,
      finalScore: representativeScore,
      starCount: thread.starCount ?? 0,
      isBatched: thread.isBatched ?? true,
    });

    // Priority was decided WITHOUT the LLM (deterministic rule), so no summary
    // is needed to score the thread — gate the background summary on the score
    // to skip summarising low-priority threads (they summarise on demand).
    await this.backgroundSummaryQueueService.maybeQueueBackgroundSummary({
      userId,
      emailId: email.id,
      threadId: emailThreadId,
      priorityScore: representativeScore,
    });

    this.logger.log(
      `[Worker ${workerId}] Deterministic priority applied to thread ${emailThreadId.substring(0, THREAD_ID_PREVIEW_LENGTH)}... score=${representativeScore} (LLM skipped)`,
    );
  }
}
