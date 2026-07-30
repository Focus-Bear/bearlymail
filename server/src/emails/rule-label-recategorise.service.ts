import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, LessThan, Repository } from "typeorm";

import { CategoryRulesService } from "../category-rules/category-rules.service";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { RULE_CATEGORY_SOURCE } from "./category-precedence.helper";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";
import { buildRuleEmailMetadata } from "./rule-email-metadata.helper";

/** Default number of threads processed per run — keeps a single job bounded. */
export const DEFAULT_RECATEGORISE_CAP = 250;
/** Hard upper bound on the per-run cap, so a caller can't request an unbounded run. */
export const MAX_RECATEGORISE_CAP = 2000;
/**
 * Default look-back window: a thread processed by this job within the last N
 * hours is skipped on a re-run, so a re-run never re-hits the LLM for a thread
 * already handled. Idempotency independent of how `categorySource` flipped.
 */
export const DEFAULT_RECATEGORISE_LOOKBACK_HOURS = 12;

export interface RecategoriseRuleThreadsOptions {
  userId: string;
  dryRun?: boolean;
  /** Per-run cap (clamped to [1, MAX_RECATEGORISE_CAP]). */
  limit?: number;
  /** Look-back window in hours for the idempotency skip. */
  lookbackHours?: number;
  /** Opaque worker/job id for audit-log correlation. */
  workerId?: string;
}

export interface RecategoriseRuleThreadsResult {
  userId: string;
  dryRun: boolean;
  cap: number;
  lookbackHours: number;
  /** All `categorySource = 'rule'` threads for the user (full scope, ignores cap/look-back). */
  totalRuleLabelled: number;
  /** Threads selected this run (eligible after look-back, up to the cap). */
  selected: number;
  /** Selected threads with no newest email found (skipped). */
  skippedNoEmail: number;
  /** A still-present rule matched — kept as a rule label, no LLM call. */
  ruleStillMatches: number;
  /** No current rule matched — the label is orphaned and re-decided by the LLM. */
  orphaned: number;
  /** LLM calls the summary categoriser is expected to make (== orphaned). */
  estimatedLlmCalls: number;
  /** Threads whose resolved category actually changed (live runs only). */
  changed: number;
  /** Threads processed but whose category was unchanged (live runs only). */
  unchanged: number;
  /** Threads a still-active rule re-filed to the SAME category (remaining-bad-rule signal). */
  reSnappedToRule: number;
  /** Threads whose re-categorisation threw (left untouched, retryable). */
  failed: number;
}

/**
 * Admin-triggered, bounded, idempotent re-categorisation of a single user's
 * threads whose category came from a now-removed over-broad deterministic rule.
 *
 * WHY: historical labels were corrupted by over-broad rules (e.g. an "Issues"
 * rule matching `Subject contains: PR run failed` filed pull-request emails as
 * Issues). The daily-retrained local model learns from these labels, so bad
 * labels cap its accuracy. Removing the rules leaves the damage behind; this job
 * re-runs the CURRENT categorisation pipeline on the affected threads to replace
 * stale labels with trustworthy ones.
 *
 * Selection: `categorySource = 'rule'` threads (user overrides write
 * `categorySource = 'user'`, so they are structurally excluded — never
 * overwritten), not processed within the look-back window, capped per run.
 *
 * Each thread is re-decided by the live category-only pipeline via
 * {@link LLMSummaryProcessorService.recategoriseRuleLabelledThread}: rules-first
 * (a still-present good rule keeps winning), else the summary LLM. Rate-aware:
 * threads are processed sequentially (no LLM thundering-herd), and only orphaned
 * labels reach the LLM. The job runs at VERY_LOW priority so it never starves
 * live refine/summary processing.
 */
@Injectable()
export class RuleLabelReCategoriseService {
  private readonly logger = new Logger(RuleLabelReCategoriseService.name);

  constructor(
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    private readonly llmSummaryProcessorService: LLMSummaryProcessorService,
    private readonly categoryRulesService: CategoryRulesService,
    private readonly userEncryptionService: UserEncryptionService,
  ) {}

  async recategoriseRuleLabelledThreads(
    options: RecategoriseRuleThreadsOptions,
  ): Promise<RecategoriseRuleThreadsResult> {
    const { userId } = options;
    const dryRun = options.dryRun ?? false;
    const cap = this.clampCap(options.limit);
    const lookbackHours =
      options.lookbackHours ?? DEFAULT_RECATEGORISE_LOOKBACK_HOURS;
    const workerId = options.workerId ?? "recategorise";

    const totalRuleLabelled = await this.emailThreadRepository.count({
      where: { userId, categorySource: RULE_CATEGORY_SOURCE },
    });

    const cutoff = new Date(Date.now() - lookbackHours * MILLISECONDS.HOUR);
    const threads = await this.selectEligibleThreads(userId, cutoff, cap);

    const result: RecategoriseRuleThreadsResult = {
      userId,
      dryRun,
      cap,
      lookbackHours,
      totalRuleLabelled,
      selected: threads.length,
      skippedNoEmail: 0,
      ruleStillMatches: 0,
      orphaned: 0,
      estimatedLlmCalls: 0,
      changed: 0,
      unchanged: 0,
      reSnappedToRule: 0,
      failed: 0,
    };

    this.logger.log(
      `Rule-label re-categorisation ${dryRun ? "(dry run) " : ""}starting for user ${userId}: ` +
        `${totalRuleLabelled} rule-labelled thread(s), ${threads.length} selected this run ` +
        `(cap ${cap}, look-back ${lookbackHours}h).`,
    );

    // Encrypted email/summary/category columns need the user's KMS key in ALS.
    // Wrap the whole loop once (one job = one user) rather than per thread.
    await this.userEncryptionService.withUserKey(userId, async () => {
      for (const thread of threads) {
        await this.processThread({ thread, userId, dryRun, workerId, result });
      }
    });

    result.estimatedLlmCalls = result.orphaned;

    this.logger.log(
      `Rule-label re-categorisation ${dryRun ? "(dry run) " : ""}done for user ${userId}: ` +
        `selected ${result.selected}, ruleStillMatches ${result.ruleStillMatches}, ` +
        `orphaned ${result.orphaned}, changed ${result.changed}, unchanged ${result.unchanged}, ` +
        `reSnappedToRule ${result.reSnappedToRule}, failed ${result.failed}, ` +
        `estimatedLlmCalls ${result.estimatedLlmCalls}.`,
    );
    return result;
  }

  private clampCap(limit: number | undefined): number {
    if (limit === undefined || !Number.isFinite(limit)) {
      return DEFAULT_RECATEGORISE_CAP;
    }
    return Math.max(1, Math.min(MAX_RECATEGORISE_CAP, Math.floor(limit)));
  }

  private async selectEligibleThreads(
    userId: string,
    cutoff: Date,
    cap: number,
  ): Promise<EmailThread[]> {
    // Never-processed (NULL) or processed before the look-back cutoff.
    // Select only plaintext columns the pipeline needs (id, categoryId,
    // categorySource) — selection runs OUTSIDE withUserKey, so hydrating the
    // thread's encrypted columns here would decrypt without the user key.
    return this.emailThreadRepository.find({
      where: [
        {
          userId,
          categorySource: RULE_CATEGORY_SOURCE,
          lastRecategorisedAt: IsNull(),
        },
        {
          userId,
          categorySource: RULE_CATEGORY_SOURCE,
          lastRecategorisedAt: LessThan(cutoff),
        },
      ],
      select: { id: true, categoryId: true, categorySource: true },
      order: { updatedAt: "DESC", id: "ASC" },
      take: cap,
    });
  }

  private async processThread(args: {
    thread: EmailThread;
    userId: string;
    dryRun: boolean;
    workerId: string;
    result: RecategoriseRuleThreadsResult;
  }): Promise<void> {
    const { thread, userId, dryRun, workerId, result } = args;

    const email = await this.emailRepository.findOne({
      where: { emailThreadId: thread.id },
      order: { receivedAt: "DESC" },
    });
    if (!email) {
      result.skippedNoEmail += 1;
      return;
    }

    if (dryRun) {
      await this.countDryRun(userId, email, result);
      return;
    }

    try {
      const outcome =
        await this.llmSummaryProcessorService.recategoriseRuleLabelledThread({
          thread,
          email,
          userId,
          workerId,
        });

      if (outcome.ruleStillMatched) {
        result.ruleStillMatches += 1;
      } else {
        result.orphaned += 1;
      }
      if (outcome.changed) {
        result.changed += 1;
        this.logger.log(
          `[recategorise] thread ${thread.id}: "${outcome.oldCategoryName}" (${outcome.oldCategoryId ?? "none"}, source rule) ` +
            `→ "${outcome.newCategoryName}" (${outcome.newCategoryId ?? "none"}, source ${outcome.newCategorySource ?? "none"})`,
        );
      } else {
        result.unchanged += 1;
      }
      if (outcome.reSnappedToSameRuleCategory) {
        result.reSnappedToRule += 1;
        this.logger.warn(
          `[recategorise] thread ${thread.id} re-snapped to the SAME rule category "${outcome.oldCategoryName}" ` +
            `(rule ${outcome.matchedRuleId ?? "?"} still active) — verify this rule is not the removed over-broad one`,
        );
      }

      // Idempotency stamp: only on success, so a failed thread stays eligible.
      await this.emailThreadRepository.update(
        { id: thread.id },
        { lastRecategorisedAt: new Date() },
      );
    } catch (error) {
      result.failed += 1;
      this.logger.warn(
        `[recategorise] thread ${thread.id} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Dry-run classification: peek the CURRENT rules (no LLM, no write) to report
   * how many selected threads would keep a rule label vs. fall through to the
   * summary LLM. `orphaned` == the estimated number of LLM calls.
   */
  private async countDryRun(
    userId: string,
    email: Email,
    result: RecategoriseRuleThreadsResult,
  ): Promise<void> {
    const { match } = await this.categoryRulesService.peekMatchingRuleWithTrace(
      userId,
      buildRuleEmailMetadata(email),
    );
    if (match?.categoryId != null) {
      result.ruleStillMatches += 1;
    } else {
      result.orphaned += 1;
    }
  }
}
