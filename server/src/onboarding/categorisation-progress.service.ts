import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { STAR_COUNTS } from "../constants/priority-constants";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  findInFlightRecategorizationBatch,
  RECATEGORIZE_TRIGGER,
} from "../emails/recategorize-jobs.helper";
import { getErrorMessage } from "../types/common";

const SETTLED_THREAD_PREDICATE = `"aiProcessingDeferred" = true
  OR ("isProcessingPriority" = false
      AND ("prioritySource" IS NOT NULL OR "categorySource" IS NOT NULL))`;

export interface CategorisationProgress {
  /** Untriaged, non-archived threads the user will land on in the inbox. */
  total: number;
  /** Of those, threads whose category decision has settled (including "Other"). */
  categorised: number;
}

interface CategorisationProgressRow {
  total: number | string | null;
  categorised: number | string | null;
}

/**
 * Reports how many of the user's triage-inbox threads have been through the
 * categorisation pipeline, so onboarding can hold the user back until the
 * inbox opens organised instead of as a wall of "Other".
 *
 * `categoryId IS NULL` cannot be the signal: NULL is also the settled answer
 * "Other". `isProcessingPriority = false` alone is not enough either — it is
 * also false on paths where no categoriser ever ran (refine-job failure,
 * queueing failure), which would let the user in early. So a thread only
 * counts once a categoriser has positively written its result
 * (`prioritySource` / `categorySource`, set by the rule, local-model and LLM
 * writers), or AI was deliberately deferred (it will never be categorised
 * now, so waiting on it is pointless).
 *
 * Once onboarding saves the categories it re-sorts the threads that settled in
 * "Other" before they existed (OnboardingCategorySortService). Those threads
 * are already settled, so the threads that sort still has queued are taken off
 * `categorised` until their job runs.
 */
@Injectable()
export class CategorisationProgressService {
  private readonly logger = new Logger(CategorisationProgressService.name);

  constructor(
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  async getProgress(userId: string): Promise<CategorisationProgress> {
    const [settled, pendingSort] = await Promise.all([
      this.querySettledProgress(userId),
      this.countPendingOnboardingSort(userId),
    ]);
    return {
      total: settled.total,
      categorised: Math.max(0, settled.categorised - pendingSort),
    };
  }

  private async querySettledProgress(
    userId: string,
  ): Promise<CategorisationProgress> {
    const rows = (await this.emailThreadRepository.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE ${SETTLED_THREAD_PREDICATE})::int AS categorised
       FROM email_threads
       WHERE "userId" = $1
         AND "isArchived" = false
         AND "starCount" = $2`,
      [userId, STAR_COUNTS.NONE],
    )) as CategorisationProgressRow[];
    return toProgress(rows[0]);
  }

  /** A failed lookup reports the settled count as-is rather than failing the poll. */
  private async countPendingOnboardingSort(userId: string): Promise<number> {
    try {
      const running = await findInFlightRecategorizationBatch(
        this.boss,
        userId,
        RECATEGORIZE_TRIGGER.ONBOARDING_CATEGORIES_SAVED,
      );
      return running?.pending ?? 0;
    } catch (error) {
      this.logger.warn(
        `Could not count the onboarding sort for user ${userId}: ${getErrorMessage(error)}`,
      );
      return 0;
    }
  }
}

function toCount(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toProgress(
  row: CategorisationProgressRow | undefined,
): CategorisationProgress {
  return {
    total: toCount(row?.total),
    categorised: toCount(row?.categorised),
  };
}
