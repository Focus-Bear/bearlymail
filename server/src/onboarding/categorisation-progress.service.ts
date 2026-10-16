import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { STAR_COUNTS } from "../constants/priority-constants";
import { EmailThread } from "../database/entities/email-thread.entity";

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
 */
@Injectable()
export class CategorisationProgressService {
  constructor(
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
  ) {}

  async getProgress(userId: string): Promise<CategorisationProgress> {
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
