import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { decryptUserContextEntityForApi } from "../encryption/entity-api-decrypt.util";

interface CacheEntry<T> {
  cachedValue: T;
  timestamp: number;
}

@Injectable()
export class PriorityCacheService {
  private readonly logger = new Logger(PriorityCacheService.name);
  private readonly contextsCache = new Map<string, CacheEntry<UserContext[]>>();
  private readonly avgTimeToReplyCache = new Map<
    string,
    CacheEntry<number | undefined>
  >();

  private readonly CONTEXTS_TTL = 5 * MILLISECONDS.MINUTE;
  private readonly AVG_TIME_TO_REPLY_TTL = MILLISECONDS.HOUR;

  constructor(
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
  ) {}

  /**
   * Get user contexts with caching
   */
  async getUserContexts(userId: string): Promise<UserContext[]> {
    const cached = this.contextsCache.get(userId);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.CONTEXTS_TTL) {
      this.logger.debug(`Cache hit for user contexts: ${userId}`);
      return cached.cachedValue;
    }

    // Cache miss - fetch from DB
    this.logger.debug(`Cache miss for user contexts: ${userId}`);
    const contexts = await this.userContextRepository.find({
      where: { userId },
    });
    for (const ctx of contexts) {
      decryptUserContextEntityForApi(ctx);
    }

    // Update cache
    this.contextsCache.set(userId, {
      cachedValue: contexts,
      timestamp: now,
    });

    return contexts;
  }

  /**
   * Invalidate user contexts cache (call when contexts are updated)
   */
  invalidateUserContexts(userId: string): void {
    this.contextsCache.delete(userId);
    this.logger.debug(`Invalidated contexts cache for user: ${userId}`);
  }

  /**
   * Get average time to reply with caching
   * Only fetches last 10 emails for performance
   */
  async getAvgTimeToReply(userId: string): Promise<number | undefined> {
    const cached = this.avgTimeToReplyCache.get(userId);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.AVG_TIME_TO_REPLY_TTL) {
      this.logger.debug(`Cache hit for avgTimeToReply: ${userId}`);
      return cached.cachedValue;
    }

    // Cache miss - calculate from DB
    this.logger.debug(`Cache miss for avgTimeToReply: ${userId}`);
    const userEmails = await this.emailRepository.find({
      where: { userId },
      // Reduced from 50 to 10 for performance
      take: 10,
      order: { receivedAt: "DESC" },
      // Only select what we need
      select: {
        timeToReply: true,
      },
    });

    const avgTimeToReply =
      userEmails.length > 0
        ? userEmails
            .filter((emailEntry) => emailEntry.timeToReply)
            .reduce(
              (sum, emailEntry) => sum + (emailEntry.timeToReply || 0),
              0,
            ) / userEmails.filter((emailEntry) => emailEntry.timeToReply).length
        : undefined;

    // Update cache
    this.avgTimeToReplyCache.set(userId, {
      cachedValue: avgTimeToReply,
      timestamp: now,
    });

    return avgTimeToReply;
  }

  /**
   * Invalidate avgTimeToReply cache (call when emails are saved/updated)
   */
  invalidateAvgTimeToReply(userId: string): void {
    this.avgTimeToReplyCache.delete(userId);
    this.logger.debug(`Invalidated avgTimeToReply cache for user: ${userId}`);
  }

  /**
   * Clear all caches (useful for testing or memory management)
   */
  clearAllCaches(): void {
    this.contextsCache.clear();
    this.avgTimeToReplyCache.clear();
    this.logger.debug("Cleared all priority caches");
  }
}
