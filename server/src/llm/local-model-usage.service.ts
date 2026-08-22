import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { LocalModelSupervision } from "../database/entities/local-model-supervision.entity";

const DEFAULT_WINDOW_DAYS = 7;
const MS_PER_DAY = 86_400_000;
const PERCENT = 100;

export interface PriorityUsage {
  local: number;
  llm: number;
  rule: number;
  unprocessed: number;
  deferred: number;
  pending: number;
  total: number;
  localPct: number;
  llmPct: number;
}

export interface CategoryUsage {
  local: number;
  llm: number;
  rule: number;
  unprocessed: number;
  deferred: number;
  pending: number;
  total: number;
  localPct: number;
}

export interface LocalModelUsage {
  window: { startDate: string; endDate: string };
  priority: PriorityUsage;
  category: CategoryUsage;
}

export interface CategoryAccuracy {
  category: string;
  /** Rate of the dominant (highest-lifetimeSamples) row for this category. */
  sampleRatePercent: number;
  lifetimeSamples: number;
  lifetimeAgreements: number;
  /** 0..100; 0 when lifetimeSamples is 0. */
  agreementPct: number;
  windowSamples: number;
  windowAgreements: number;
}

export interface CategoryAccuracyReport {
  overall: { samples: number; agreements: number; agreementPct: number };
  /** Sorted by lifetimeSamples DESC. */
  categories: CategoryAccuracy[];
}

/**
 * A category's counters aggregated across all users (same `categoryHash`), plus
 * the display name and supervision rate of its dominant (most-sampled) row.
 */
interface CategoryAccumulator {
  category: string;
  sampleRatePercent: number;
  dominantLifetimeSamples: number;
  lifetimeSamples: number;
  lifetimeAgreements: number;
  windowSamples: number;
  windowAgreements: number;
}

type SourceColumn = "prioritySource" | "categorySource";

/**
 * The per-source group counts plus, within the NULL-source group, how many rows
 * were deferred by design (`aiProcessingDeferred = true`). Deferral (org
 * volume-cap / inactive-user) skips the scoring job, so those threads keep a
 * NULL source forever and must not be conflated with genuinely pending ones.
 */
interface SourceCounts {
  counts: Map<string | null, number>;
  deferred: number;
}

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * PERCENT);
}

/**
 * Admin-wide view of how the priority/category pipeline is split between the
 * local model (LLM skipped), the LLM and deterministic rules — read straight
 * from `email_threads.prioritySource` / `categorySource`, no extra tracking.
 */
@Injectable()
export class LocalModelUsageService {
  constructor(
    @InjectRepository(EmailThread)
    private readonly threadRepository: Repository<EmailThread>,
    @InjectRepository(LocalModelSupervision)
    private readonly supervisionRepository: Repository<LocalModelSupervision>,
  ) {}

  async getUsage(options: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<LocalModelUsage> {
    const endDate = options.endDate ?? new Date();
    const startDate =
      options.startDate ??
      new Date(endDate.getTime() - DEFAULT_WINDOW_DAYS * MS_PER_DAY);

    const [priorityCounts, categoryCounts] = await Promise.all([
      this.countBySource("prioritySource", startDate, endDate),
      this.countBySource("categorySource", startDate, endDate),
    ]);

    return {
      window: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      priority: this.buildPriority(priorityCounts),
      category: this.buildCategory(categoryCounts),
    };
  }

  /**
   * Count threads that RECEIVED an email in the window, grouped by the source
   * column. Scope by the thread's own emails' `receivedAt`, NOT the thread's
   * `updatedAt` or `createdAt`:
   * - `updatedAt` is bumped by unrelated writes (provider sync, star/archive,
   *   the isProcessingPriority lock), so it dragged old, never-processed backlog
   *   threads into a "Last 24 Hours" view and inflated "unprocessed".
   * - `createdAt` (first sync) misses threads that were created earlier but
   *   received a NEW email inside the window — those are genuinely recent
   *   activity that should be counted.
   * A thread counts when it has any email with `receivedAt` in [start, end].
   * Since the dashboard's windows always end at "now", that is equivalent to
   * "the thread's latest email arrived in the window", and the EXISTS
   * short-circuits on the first in-window email (index-backed).
   */
  private async countBySource(
    column: SourceColumn,
    startDate: Date,
    endDate: Date,
  ): Promise<SourceCounts> {
    // `column` is a fixed union (not user input), so interpolating it is safe.
    const rows = await this.threadRepository
      .createQueryBuilder("thread")
      .select(`thread."${column}"`, "source")
      .addSelect("COUNT(*)", "count")
      .addSelect(
        'COUNT(*) FILTER (WHERE thread."aiProcessingDeferred" = true)',
        "deferred",
      )
      .where('thread."userId" IS NOT NULL')
      .andWhere(
        (qb) =>
          `EXISTS ${qb
            .subQuery()
            .select("1")
            .from(Email, "email")
            .where('email."emailThreadId" = thread.id')
            .andWhere('email."receivedAt" BETWEEN :startDate AND :endDate')
            .getQuery()}`,
        { startDate, endDate },
      )
      .groupBy(`thread."${column}"`)
      .getRawMany<{ source: string | null; count: string; deferred: string }>();

    const counts = new Map<string | null, number>();
    let deferred = 0;
    for (const row of rows) {
      counts.set(row.source, parseInt(row.count, 10));
      // Deferred-by-design threads never get a source, so they live in the
      // NULL group; only that group's deferred tally is meaningful.
      if (row.source === null) {
        deferred = parseInt(row.deferred ?? "0", 10);
      }
    }
    return { counts, deferred };
  }

  private buildPriority(source: SourceCounts): PriorityUsage {
    const { counts, deferred } = source;
    const local = counts.get("local") ?? 0;
    const rule = counts.get("rule") ?? 0;
    const unprocessed = counts.get(null) ?? 0;
    // Split the NULL bucket: `deferred` was skipped by design (volume cap /
    // inactive user), `pending` is genuinely awaiting or failed scoring.
    const pending = unprocessed - deferred;
    let total = 0;
    for (const count of counts.values()) {
      total += count;
    }
    // Any non-local, non-rule, non-null source ("llm" and any future value) is
    // an LLM path — derive it from the total so nothing is dropped.
    const llm = total - local - rule - unprocessed;
    return {
      local,
      llm,
      rule,
      unprocessed,
      deferred,
      pending,
      total,
      localPct: pct(local, total),
      llmPct: pct(llm, total),
    };
  }

  private buildCategory(source: SourceCounts): CategoryUsage {
    const { counts, deferred } = source;
    const local = counts.get("local") ?? 0;
    const rule = counts.get("rule") ?? 0;
    const unprocessed = counts.get(null) ?? 0;
    // Split the NULL bucket: `deferred` was skipped by design (volume cap /
    // inactive user), `pending` is genuinely awaiting or failed scoring.
    const pending = unprocessed - deferred;
    let total = 0;
    for (const count of counts.values()) {
      total += count;
    }
    // Any non-local, non-rule, non-null categorySource ("summary" / "priority" /
    // "user") is an LLM-driven pick — derive it so nothing is dropped.
    const llm = total - local - rule - unprocessed;
    return {
      local,
      llm,
      rule,
      unprocessed,
      deferred,
      pending,
      total,
      localPct: pct(local, total),
    };
  }

  /**
   * Admin view of how often the local category model agreed with the LLM on the
   * supervised (diverted) samples. Aggregated across users by `categoryHash`
   * (the hash is deterministic across users); the display name and supervision
   * rate come from each category's dominant (most-sampled) row. Agreement % is
   * based on the never-reset lifetime counters, not the noisy window ones.
   */
  async getCategoryAccuracy(): Promise<CategoryAccuracyReport> {
    const rows = await this.supervisionRepository.find();

    const byHash = new Map<string, CategoryAccumulator>();
    let overallSamples = 0;
    let overallAgreements = 0;

    for (const row of rows) {
      overallSamples += row.lifetimeSamples;
      overallAgreements += row.lifetimeAgreements;

      const existing = byHash.get(row.categoryHash);
      if (!existing) {
        byHash.set(row.categoryHash, {
          category: row.category,
          sampleRatePercent: row.sampleRatePercent,
          dominantLifetimeSamples: row.lifetimeSamples,
          lifetimeSamples: row.lifetimeSamples,
          lifetimeAgreements: row.lifetimeAgreements,
          windowSamples: row.windowSamples,
          windowAgreements: row.windowAgreements,
        });
        continue;
      }

      existing.lifetimeSamples += row.lifetimeSamples;
      existing.lifetimeAgreements += row.lifetimeAgreements;
      existing.windowSamples += row.windowSamples;
      existing.windowAgreements += row.windowAgreements;
      // The dominant row (most lifetime samples) supplies the display name and
      // the representative supervision rate.
      if (row.lifetimeSamples > existing.dominantLifetimeSamples) {
        existing.dominantLifetimeSamples = row.lifetimeSamples;
        existing.category = row.category;
        existing.sampleRatePercent = row.sampleRatePercent;
      }
    }

    const categories: CategoryAccuracy[] = Array.from(byHash.values())
      .map((acc) => ({
        category: acc.category,
        sampleRatePercent: acc.sampleRatePercent,
        lifetimeSamples: acc.lifetimeSamples,
        lifetimeAgreements: acc.lifetimeAgreements,
        agreementPct: pct(acc.lifetimeAgreements, acc.lifetimeSamples),
        windowSamples: acc.windowSamples,
        windowAgreements: acc.windowAgreements,
      }))
      .sort((first, second) => second.lifetimeSamples - first.lifetimeSamples);

    return {
      overall: {
        samples: overallSamples,
        agreements: overallAgreements,
        agreementPct: pct(overallAgreements, overallSamples),
      },
      categories,
    };
  }
}
