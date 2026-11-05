import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as crypto from "crypto";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { STAR_COUNTS } from "../constants/priority-constants";
import { QUERY_LIMITS } from "../constants/query-limits";
import { EmailThread } from "../database/entities/email-thread.entity";
import { User } from "../database/entities/user.entity";
import {
  RULE_CATEGORY_SOURCE,
  USER_CATEGORY_SOURCE,
} from "../emails/category-precedence.helper";
import {
  enqueueRecategorizationJobs,
  findInFlightRecategorizationBatch,
  RECATEGORIZE_TRIGGER,
} from "../emails/recategorize-jobs.helper";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { getErrorMessage } from "../types/common";

export const ONBOARDING_CATEGORY_SORT_OUTCOME = {
  QUEUED: "queued",
  NOT_ONBOARDING: "not_onboarding",
  ALREADY_RUNNING: "already_running",
  AI_CAPACITY_EXCEEDED: "ai_capacity_exceeded",
  NOTHING_TO_SORT: "nothing_to_sort",
  FAILED: "failed",
} as const;

export type OnboardingCategorySortOutcome =
  (typeof ONBOARDING_CATEGORY_SORT_OUTCOME)[keyof typeof ONBOARDING_CATEGORY_SORT_OUTCOME];

interface UnsortedThreadEmailRow {
  emailId: string;
}

const LOG_PREFIX = "[ONBOARDING-CATEGORY-SORT]";

/**
 * Sorts the threads the first sync triaged before the user had any categories.
 *
 * Onboarding's first sync runs every thread through Jev while the category set
 * is still being proposed, and Jev only ever offers the user's own categories,
 * so those threads land in "Other". Once the context analysis saves the
 * categories, this re-runs the same re-categorisation pipeline as the
 * Re-categorise buttons over the triage threads still in "Other", so the inbox
 * opens sorted without the user having to ask.
 */
@Injectable()
export class OnboardingCategorySortService {
  private readonly logger = new Logger(OnboardingCategorySortService.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Queues the sort for a user who is still onboarding. Never throws: it runs
   * at the end of the context-analysis finalizer, and a failure here must not
   * fail the analysis that already saved the user's categories.
   */
  async sortOnboardingThreadsIntoCategories(
    userId: string,
  ): Promise<OnboardingCategorySortOutcome> {
    try {
      return await this.queueSort(userId);
    } catch (error) {
      this.logger.warn(
        `${LOG_PREFIX} Could not queue the sort for user ${userId}: ${getErrorMessage(error)}`,
      );
      return ONBOARDING_CATEGORY_SORT_OUTCOME.FAILED;
    }
  }

  private async queueSort(
    userId: string,
  ): Promise<OnboardingCategorySortOutcome> {
    if (!(await this.isStillOnboarding(userId))) {
      return ONBOARDING_CATEGORY_SORT_OUTCOME.NOT_ONBOARDING;
    }

    const running = await findInFlightRecategorizationBatch(
      this.boss,
      userId,
      RECATEGORIZE_TRIGGER.ONBOARDING_CATEGORIES_SAVED,
    );
    if (running) {
      this.logger.log(
        `${LOG_PREFIX} Sort ${running.batchId} already running for user ${userId} (${running.pending} pending) — not queuing another`,
      );
      return ONBOARDING_CATEGORY_SORT_OUTCOME.ALREADY_RUNNING;
    }

    const { allowed, percentUsed } =
      await this.subscriptionsService.checkAiCapacity(userId);
    if (!allowed) {
      this.logger.warn(
        `${LOG_PREFIX} Skipped for user ${userId}: ${percentUsed}% of plan email volume used`,
      );
      return ONBOARDING_CATEGORY_SORT_OUTCOME.AI_CAPACITY_EXCEEDED;
    }

    const emailIds = await this.findUnsortedThreadEmailIds(userId);
    if (emailIds.length === 0) {
      return ONBOARDING_CATEGORY_SORT_OUTCOME.NOTHING_TO_SORT;
    }

    const batchId = crypto.randomUUID();
    const queued = await enqueueRecategorizationJobs(this.boss, {
      userId,
      emailIds,
      batchId,
      trigger: RECATEGORIZE_TRIGGER.ONBOARDING_CATEGORIES_SAVED,
    });
    this.logger.log(
      `${LOG_PREFIX} Queued ${queued}/${emailIds.length} threads for user ${userId}, batchId: ${batchId}`,
    );
    return ONBOARDING_CATEGORY_SORT_OUTCOME.QUEUED;
  }

  /** A Settings "Analyze" re-run also finalizes; only onboarding sorts automatically. */
  private async isStillOnboarding(userId: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, hasCompletedOnboarding: true },
    });
    return user !== null && !user.hasCompletedOnboarding;
  }

  /**
   * The newest email of each triage thread still in "Other", newest threads
   * first. Threads the user or a category rule placed are left alone, as are
   * threads whose own pipeline run hasn't finished — that run reads the
   * categories that were just saved. Capped at the first sync's size.
   */
  private async findUnsortedThreadEmailIds(userId: string): Promise<string[]> {
    const rows = (await this.emailThreadRepository.query(
      `SELECT latest."emailId"
       FROM (
         SELECT DISTINCT ON (email."emailThreadId")
           email.id AS "emailId", email."receivedAt"
         FROM email_threads thread
         INNER JOIN emails email ON email."emailThreadId" = thread.id
         WHERE thread."userId" = $1
           AND email."userId" = $1
           AND thread."isArchived" = false
           AND thread."starCount" = $2
           AND thread."categoryId" IS NULL
           AND thread."isProcessingPriority" = false
           AND (thread."categorySource" IS NULL
                OR thread."categorySource" NOT IN ($3, $4))
         ORDER BY email."emailThreadId", email."receivedAt" DESC
       ) latest
       ORDER BY latest."receivedAt" DESC
       LIMIT $5`,
      [
        userId,
        STAR_COUNTS.NONE,
        USER_CATEGORY_SOURCE,
        RULE_CATEGORY_SOURCE,
        QUERY_LIMITS.INITIAL_SYNC_MAX_EMAILS,
      ],
    )) as UnsortedThreadEmailRow[];
    return rows.map((row) => row.emailId);
  }
}
