import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";

const DEFAULT_WINDOW_DAYS = 7;
const MS_PER_DAY = 86_400_000;
const PERCENT = 100;

export interface PriorityUsage {
  local: number;
  llm: number;
  rule: number;
  unprocessed: number;
  total: number;
  localPct: number;
  llmPct: number;
}

export interface CategoryUsage {
  local: number;
  llm: number;
  rule: number;
  unprocessed: number;
  total: number;
  localPct: number;
}

export interface LocalModelUsage {
  window: { startDate: string; endDate: string };
  priority: PriorityUsage;
  category: CategoryUsage;
}

type SourceColumn = "prioritySource" | "categorySource";

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
  ): Promise<Map<string | null, number>> {
    // `column` is a fixed union (not user input), so interpolating it is safe.
    const rows = await this.threadRepository
      .createQueryBuilder("thread")
      .select(`thread."${column}"`, "source")
      .addSelect("COUNT(*)", "count")
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
      .getRawMany<{ source: string | null; count: string }>();

    const counts = new Map<string | null, number>();
    for (const row of rows) {
      counts.set(row.source, parseInt(row.count, 10));
    }
    return counts;
  }

  private buildPriority(counts: Map<string | null, number>): PriorityUsage {
    const local = counts.get("local") ?? 0;
    const rule = counts.get("rule") ?? 0;
    const unprocessed = counts.get(null) ?? 0;
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
      total,
      localPct: pct(local, total),
      llmPct: pct(llm, total),
    };
  }

  private buildCategory(counts: Map<string | null, number>): CategoryUsage {
    const local = counts.get("local") ?? 0;
    const rule = counts.get("rule") ?? 0;
    const unprocessed = counts.get(null) ?? 0;
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
      total,
      localPct: pct(local, total),
    };
  }
}
