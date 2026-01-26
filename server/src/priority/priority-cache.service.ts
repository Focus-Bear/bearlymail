import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserContext } from "../database/entities/user-context.entity";
import { Email } from "../database/entities/email.entity";

interface CacheEntry<T> {
  data: T;
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

  // TTL in milliseconds
  private readonly CONTEXTS_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly AVG_TIME_TO_REPLY_TTL = 60 * 60 * 1000; // 1 hour

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
      return cached.data;
    }

    // Cache miss - fetch from DB
    this.logger.debug(`Cache miss for user contexts: ${userId}`);
    const contexts = await this.userContextRepository.find({
      where: { userId },
    });

    // Update cache
    this.contextsCache.set(userId, {
      data: contexts,
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
      return cached.data;
    }

    // Cache miss - calculate from DB
    this.logger.debug(`Cache miss for avgTimeToReply: ${userId}`);
    const userEmails = await this.emailRepository.find({
      where: { userId },
      take: 10, // Reduced from 50 to 10 for performance
      order: { receivedAt: "DESC" },
      select: ["timeToReply"], // Only select what we need
    });

    const avgTimeToReply =
      userEmails.length > 0
        ? userEmails
            .filter((e) => e.timeToReply)
            .reduce((sum, e) => sum + (e.timeToReply || 0), 0) /
          userEmails.filter((e) => e.timeToReply).length
        : undefined;

    // Update cache
    this.avgTimeToReplyCache.set(userId, {
      data: avgTimeToReply,
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
