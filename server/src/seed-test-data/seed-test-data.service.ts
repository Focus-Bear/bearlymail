import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { getPersonaDataset } from "./personas";
import {
  bandScore,
  bandUrgency,
  buildPriorityExplanation,
} from "./seed-builder";
import { OTHER_CATEGORY_SLUG, PersonaKey } from "./seed-types";

/** Every seeded row's threadId / messageId starts with this so deletes are precise. */
const SEED_PREFIX = "seedtest-";
/** Seeded category rows carry this categoryKey prefix. */
const SEED_CATEGORY_KEY_PREFIX = "seedtest_";

// 150 emails × 95 minutes ≈ 10 days of spread.
const MINUTES_BETWEEN_EMAILS = 95;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;

@Injectable()
export class SeedTestDataService {
  private readonly logger = new Logger(SeedTestDataService.name);

  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private readonly threadRepository: Repository<EmailThread>,
    @InjectRepository(UserContext)
    private readonly contextRepository: Repository<UserContext>,
  ) {}

  /** Replace any existing seeded data with a fresh set for the given persona. */
  async seed(
    userId: string,
    persona: PersonaKey,
  ): Promise<{ seeded: number; persona: PersonaKey }> {
    await this.deleteAll(userId);

    const dataset = getPersonaDataset(persona);
    const categoryIdBySlug = await this.createCategories(
      userId,
      dataset.categories,
    );

    const base = Date.now();
    const rows = dataset.emails.map((spec, i) => ({
      spec,
      score: bandScore(spec.band, i),
      threadId: `${SEED_PREFIX}${persona}-${i}`,
      receivedAt: new Date(base - i * MINUTES_BETWEEN_EMAILS * MS_PER_MINUTE),
      categoryId:
        spec.categorySlug === OTHER_CATEGORY_SLUG
          ? null
          : (categoryIdBySlug.get(spec.categorySlug) ?? null),
    }));

    // Bulk-insert threads, then emails — two round-trips instead of 300+, so a
    // full 150-email seed stays a single fast request. save() returns entities
    // in input order, so savedThreads[i] pairs with rows[i].
    const savedThreads = await this.threadRepository.save(
      rows.map((row) =>
        this.threadRepository.create({
          userId,
          threadId: row.threadId,
          starCount: row.spec.isFollowUp
            ? (row.spec.starCount ?? 1)
            : (row.spec.starCount ?? 0),
          isArchived: false,
          urgencyScore: bandUrgency(row.score),
          priorityScore: row.score,
          priorityExplanation: buildPriorityExplanation(
            row.spec.band,
            row.score,
            row.receivedAt.toISOString(),
          ),
          isProcessingPriority: false,
          aiProcessingDeferred: false,
          categoryId: row.categoryId,
        }),
      ),
    );

    await this.emailRepository.save(
      rows.map((row, i) =>
        this.emailRepository.create({
          userId,
          threadId: row.threadId,
          emailThreadId: savedThreads[i].id,
          messageId: row.threadId,
          from: row.spec.fromEmail,
          fromName: row.spec.fromName,
          subject: row.spec.subject,
          // Fall back to the (always-present) summary, never "" — Email.body
          // is a NOT NULL encrypted column, and EncryptionHelper.encrypt("")
          // returns null for falsy input, which violates the constraint.
          // Only the hand-authored "hero" emails carry a real body; the
          // generated filler majority relies on summary-only display, so
          // this fallback is also the more realistic content to store.
          body: row.spec.body || row.spec.summary,
          summary: row.spec.summary,
          isRead: row.spec.isRead ?? false,
          isBatched: false,
          isSnoozed: false,
          isProcessingSummary: false,
          receivedAt: row.receivedAt,
          labels: row.spec.isFollowUp ? ["SENT"] : undefined,
        }),
      ),
    );

    const seeded = rows.length;
    this.logger.log(
      `Seeded ${seeded} emails for persona "${persona}" (user ${userId})`,
    );
    return { seeded, persona };
  }

  /** Remove every seeded thread, email and category for the user. Returns threads deleted. */
  async deleteAll(userId: string): Promise<{ deleted: number }> {
    await this.emailRepository
      .createQueryBuilder()
      .delete()
      .from(Email)
      .where('"userId" = :userId', { userId })
      .andWhere('"messageId" LIKE :prefix', { prefix: `${SEED_PREFIX}%` })
      .execute();

    const threadResult = await this.threadRepository
      .createQueryBuilder()
      .delete()
      .from(EmailThread)
      .where('"userId" = :userId', { userId })
      .andWhere('"threadId" LIKE :prefix', { prefix: `${SEED_PREFIX}%` })
      .execute();

    await this.contextRepository
      .createQueryBuilder()
      .delete()
      .from(UserContext)
      .where('"userId" = :userId', { userId })
      .andWhere('"contextKey" = :key', { key: ContextKey.EMAIL_CATEGORY })
      .andWhere('"categoryKey" LIKE :prefix', {
        prefix: `${SEED_CATEGORY_KEY_PREFIX}%`,
      })
      .execute();

    const deleted = threadResult.affected ?? 0;
    this.logger.log(`Deleted ${deleted} seeded threads for user ${userId}`);
    return { deleted };
  }

  /** Create the persona's EMAIL_CATEGORY rows; return a slug → contextId map. */
  private async createCategories(
    userId: string,
    categories: { slug: string; name: string; description: string }[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const category of categories) {
      const saved = await this.contextRepository.save(
        this.contextRepository.create({
          userId,
          contextKey: ContextKey.EMAIL_CATEGORY,
          contextValue: `${category.name} - ${category.description}`,
          categoryKey: `${SEED_CATEGORY_KEY_PREFIX}${category.slug}`,
          source: Source.AUTOGENERATED,
        }),
      );
      map.set(category.slug, saved.contextId);
    }
    return map;
  }
}
