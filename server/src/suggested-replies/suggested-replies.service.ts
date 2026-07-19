import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { QUERY_LIMITS } from "../constants/query-limits";
import { SECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { SuggestedReply } from "../database/entities/suggested-reply.entity";
import { getJobPriority } from "../queue/job-priorities";

@Injectable()
export class SuggestedRepliesService {
  private readonly logger = new Logger(SuggestedRepliesService.name);

  constructor(
    @InjectRepository(SuggestedReply)
    private suggestedReplyRepository: Repository<SuggestedReply>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  async getSuggestedReplies(
    userId: string,
    threadId: string,
  ): Promise<SuggestedReply | null> {
    return this.suggestedReplyRepository.findOne({
      where: { userId, emailThreadId: threadId },
    });
  }

  async saveSuggestedReplies(
    userId: string,
    threadId: string,
    options: Array<{ label: string; text: string }>,
    lastEmailId: string | null,
  ): Promise<SuggestedReply> {
    const existing = await this.getSuggestedReplies(userId, threadId);

    if (existing) {
      existing.options = options;
      existing.lastEmailId = lastEmailId;
      existing.isGenerating = false;
      return this.suggestedReplyRepository.save(existing);
    }

    const suggestedReply = this.suggestedReplyRepository.create({
      userId,
      emailThreadId: threadId,
      options,
      lastEmailId,
      isGenerating: false,
    });

    return this.suggestedReplyRepository.save(suggestedReply);
  }

  async markAsGenerating(userId: string, threadId: string): Promise<void> {
    const existing = await this.getSuggestedReplies(userId, threadId);

    if (existing) {
      existing.isGenerating = true;
      await this.suggestedReplyRepository.save(existing);
    } else {
      const suggestedReply = this.suggestedReplyRepository.create({
        userId,
        emailThreadId: threadId,
        options: [],
        lastEmailId: null,
        isGenerating: true,
      });
      await this.suggestedReplyRepository.save(suggestedReply);
    }
  }

  async markAsNotGenerating(userId: string, threadId: string): Promise<void> {
    await this.suggestedReplyRepository.update(
      { userId, emailThreadId: threadId },
      { isGenerating: false },
    );
  }

  async deleteSuggestedReplies(
    userId: string,
    threadId: string,
  ): Promise<void> {
    await this.suggestedReplyRepository.delete({
      userId,
      emailThreadId: threadId,
    });
  }

  async queueSuggestedReplyGeneration(
    userId: string,
    threadId: string,
    emailId: string,
  ): Promise<void> {
    this.logger.log(
      `Queueing suggested reply generation for thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...`,
    );

    await this.boss.send(
      JOB_NAMES.GENERATE_SUGGESTED_REPLIES,
      { userId, threadId, emailId },
      {
        priority: getJobPriority(JOB_NAMES.GENERATE_SUGGESTED_REPLIES, false),
        singletonKey: `generate-suggested-replies-${userId}-${threadId}`,
        singletonSeconds: SECONDS.FIVE_MINUTES,
      },
    );
  }

  async needsRegeneration(
    userId: string,
    threadId: string,
    latestEmailId: string,
  ): Promise<boolean> {
    const existing = await this.getSuggestedReplies(userId, threadId);

    if (!existing) {
      return true;
    }

    if (existing.isGenerating) {
      return false;
    }

    if (existing.lastEmailId !== latestEmailId) {
      return true;
    }

    return false;
  }

  async ensureSuggestedReplies(
    userId: string,
    threadId: string,
  ): Promise<{ queued: boolean; isGenerating: boolean; hasOptions: boolean }> {
    const latestEmail = await this.emailRepository.findOne({
      where: { emailThreadId: threadId, userId },
      order: { receivedAt: "DESC" },
    });

    if (!latestEmail) {
      this.logger.warn(
        `No emails found in thread ${threadId} for user ${userId}`,
      );
      return { queued: false, isGenerating: false, hasOptions: false };
    }

    const existing = await this.getSuggestedReplies(userId, threadId);

    if (existing?.isGenerating) {
      return { queued: false, isGenerating: true, hasOptions: false };
    }

    if (
      existing?.options &&
      existing.options.length > 0 &&
      existing.lastEmailId === latestEmail.id
    ) {
      return { queued: false, isGenerating: false, hasOptions: true };
    }

    await this.queueSuggestedReplyGeneration(userId, threadId, latestEmail.id);
    return { queued: true, isGenerating: true, hasOptions: false };
  }
}
