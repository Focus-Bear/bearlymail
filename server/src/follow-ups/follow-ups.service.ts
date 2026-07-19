import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { LessThanOrEqual, Repository } from "typeorm";

import { FOLLOW_UP_GENERATION_STATUS } from "../constants/domain-statuses";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { QUERY_LIMITS } from "../constants/query-limits";
import { SECONDS } from "../constants/time-constants";
import { ContextService } from "../context/context.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  FollowUp,
  FollowUpStatus,
} from "../database/entities/follow-up.entity";
import { ContextKey } from "../database/entities/user-context.entity";
import { EmailsService } from "../emails/emails.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { LLMService } from "../llm/llm.service";
import { UsersService } from "../users/users.service";
import { calculateBusinessDays } from "../utils/business-days.util";

@Injectable()
export class FollowUpsService {
  private readonly logger = new Logger(FollowUpsService.name);

  constructor(
    @InjectRepository(FollowUp)
    private followUpRepository: Repository<FollowUp>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    private llmService: LLMService,
    private usersService: UsersService,
    private contextService: ContextService,
    private emailsService: EmailsService,
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
  ) {}

  /**
   * Create a follow-up reminder after sending an email
   */
  async createFollowUp(
    userId: string,
    threadId: string,
    followUpDays: number,
    sentEmailId?: string,
  ): Promise<FollowUp> {
    // Find the email thread
    const emailThread = await this.emailThreadRepository.findOne({
      where: { userId, threadId },
    });

    // Get the latest emails in the thread to capture context
    const emails = await this.emailRepository.find({
      where: { userId, threadId },
      order: { receivedAt: "DESC" },
      take: 10,
    });

    // Find the last email from "them" (not from user) and from user
    const userEmails: Email[] = [];
    const myEmails: Email[] = [];

    for (const email of emails) {
      if (await this.isFromUser(email, userId)) {
        myEmails.push(email);
      } else {
        userEmails.push(email);
      }
    }

    const lastTheirEmail = userEmails[0];
    const lastMyEmail = myEmails[0];

    const followUpDueAt = new Date();
    followUpDueAt.setDate(followUpDueAt.getDate() + followUpDays);

    const followUp = this.followUpRepository.create({
      userId,
      threadId,
      emailThreadId: emailThread?.id,
      sentEmailId,
      status: FollowUpStatus.AWAITING_REPLY,
      followUpDueAt,
      followUpDays,
      lastTheirReply: lastTheirEmail?.body?.substring(
        0,
        QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH,
      ),
      lastTheirReplyFrom: lastTheirEmail?.fromName || lastTheirEmail?.from,
      lastTheirReplyAt: lastTheirEmail?.receivedAt,
      lastMyReply: lastMyEmail?.body?.substring(
        0,
        QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH,
      ),
      lastMyReplyAt: lastMyEmail?.receivedAt,
      subject: emails[0]?.subject,
    });

    return this.followUpRepository.save(followUp);
  }

  /**
   * Get all follow-ups for a user that are due (awaiting reply tab)
   */
  async getDueFollowUps(userId: string): Promise<FollowUp[]> {
    const now = new Date();

    return this.followUpRepository.find({
      where: [
        {
          userId,
          status: FollowUpStatus.FOLLOW_UP_DUE,
        },
        {
          userId,
          status: FollowUpStatus.AWAITING_REPLY,
          followUpDueAt: LessThanOrEqual(now),
        },
      ],
      order: { followUpDueAt: "ASC" },
    });
  }

  /**
   * Get all active follow-ups (awaiting reply, not yet due)
   */
  async getAwaitingReplyFollowUps(userId: string): Promise<FollowUp[]> {
    return this.followUpRepository.find({
      where: {
        userId,
        status: FollowUpStatus.AWAITING_REPLY,
      },
      order: { followUpDueAt: "ASC" },
    });
  }

  /**
   * Update follow-up status when a reply is received
   */
  async markAsReplied(userId: string, threadId: string): Promise<void> {
    await this.followUpRepository.update(
      { userId, threadId, status: FollowUpStatus.AWAITING_REPLY },
      { status: FollowUpStatus.COMPLETED },
    );
    await this.followUpRepository.update(
      { userId, threadId, status: FollowUpStatus.FOLLOW_UP_DUE },
      { status: FollowUpStatus.COMPLETED },
    );
  }

  /**
   * Generate follow-up draft messages for all due follow-ups
   */
  async generateFollowUpDrafts(userId: string): Promise<FollowUp[]> {
    const dueFollowUps = await this.getDueFollowUps(userId);

    for (const followUp of dueFollowUps) {
      if (!followUp.draftFollowUp) {
        try {
          // Build thread messages array from follow-up data
          const threadMessages: Array<{
            from: string;
            fromName?: string;
            body: string;
            receivedAt: Date;
            isFromUser: boolean;
          }> = [];

          // Add their last reply if available
          if (followUp.lastTheirReply) {
            threadMessages.push({
              from: followUp.lastTheirReplyFrom || "them",
              body: followUp.lastTheirReply,
              receivedAt: followUp.lastTheirReplyAt || new Date(),
              isFromUser: false,
            });
          }

          // Add user's last reply if available
          if (followUp.lastMyReply) {
            threadMessages.push({
              from: "me",
              body: followUp.lastMyReply,
              receivedAt: followUp.lastMyReplyAt || new Date(),
              isFromUser: true,
            });
          }

          const draft = await this.llmService.generateFollowUpDraft({
            subject: followUp.subject || "Follow up",
            threadMessages,
            theirName: followUp.lastTheirReplyFrom || "them",
            businessDaysWaiting: followUp.followUpDays,
          });
          followUp.draftFollowUp = draft;
          await this.followUpRepository.save(followUp);
        } catch (error) {
          this.logger.error(
            `Error generating follow-up draft for ${followUp.id}:`,
            error,
          );
        }
      }

      // Update status to FOLLOW_UP_DUE if past due date
      if (
        followUp.status === FollowUpStatus.AWAITING_REPLY &&
        followUp.followUpDueAt <= new Date()
      ) {
        followUp.status = FollowUpStatus.FOLLOW_UP_DUE;
        await this.followUpRepository.save(followUp);
      }
    }

    return dueFollowUps;
  }

  /**
   * Update a follow-up draft
   */
  async updateDraft(
    followUpId: string,
    userId: string,
    draft: string,
  ): Promise<FollowUp> {
    const followUp = await this.followUpRepository.findOne({
      where: { id: followUpId, userId },
    });

    if (!followUp) {
      throw new Error(ERROR_MESSAGES.FOLLOW_UP_NOT_FOUND);
    }

    followUp.draftFollowUp = draft;
    return this.followUpRepository.save(followUp);
  }

  /**
   * Mark a follow-up as completed (sent or cancelled)
   */
  async completeFollowUp(
    followUpId: string,
    userId: string,
    cancelled = false,
  ): Promise<void> {
    await this.followUpRepository.update(
      { id: followUpId, userId },
      {
        status: cancelled ? FollowUpStatus.CANCELLED : FollowUpStatus.COMPLETED,
      },
    );
  }

  /**
   * Cancel a follow-up
   */
  async cancelFollowUp(followUpId: string, userId: string): Promise<void> {
    await this.completeFollowUp(followUpId, userId, true);
  }

  /**
   * Check if an email is from the user (sent by them)
   */
  private async isFromUser(email: Email, userId: string): Promise<boolean> {
    // Check if email has SENT label
    if (email.labels?.includes("SENT")) {
      return true;
    }

    // Fallback: compare with user's email address
    try {
      const user = await this.usersService.findOne(userId);
      if (user?.email) {
        const userEmail = EncryptionHelper.tryDecrypt(user.email);
        const emailFrom = EncryptionHelper.tryDecrypt(email.from);
        return (
          (emailFrom ?? "").toLowerCase() === (userEmail ?? "").toLowerCase()
        );
      }
    } catch (error) {
      this.logger.warn(`Error checking if email is from user: ${error}`);
    }

    return false;
  }

  /**
   * Review and clean up a follow-up draft before sending
   * Checks user's tone, adds greeting if missing, and ensures it matches their writing style
   */
  async reviewAndCleanupDraft(
    followUpId: string,
    userId: string,
    draft: string,
    recipientName?: string,
  ): Promise<string> {
    const followUp = await this.getFollowUp(followUpId, userId);
    if (!followUp) {
      throw new Error(ERROR_MESSAGES.FOLLOW_UP_NOT_FOUND);
    }

    // Get user's communication style
    const contexts = await this.contextService.getUserContext(userId);
    const tone =
      contexts.find((item) => item.contextKey === ContextKey.WRITING_STYLE_TONE)
        ?.contextValue || "professional";
    const commonPhrases = contexts
      .filter((item) => item.contextKey === ContextKey.COMMON_PHRASE)
      .map((item) => item.contextValue);

    // Check if user has preference to skip greeting
    const skipGreeting =
      tone.toLowerCase().includes("no greeting") ||
      tone.toLowerCase().includes("skip greeting");

    // Check if draft already has a greeting
    const hasGreeting =
      /^(hi|hey|hello|dear|greetings|good morning|good afternoon|good evening)[\s,]/i.test(
        draft.trim(),
      );

    // Build review prompt
    let systemPrompt = `You are a helpful assistant that reviews and cleans up email drafts.
Your job is to ensure the draft:
1. Matches the user's preferred tone and writing style
2. Includes a greeting (unless user explicitly prefers no greeting)
3. Is clear, concise, and professional
4. Uses the user's common phrases when appropriate`;

    if (tone) {
      systemPrompt += `\n\nUser's preferred tone: ${tone}`;
    }

    if (commonPhrases.length > 0) {
      systemPrompt += `\n\nUser commonly uses these phrases: ${commonPhrases.join(", ")}`;
    }

    const prompt = `Review and clean up this follow-up email draft:

Draft:
${draft}

${recipientName ? `Recipient: ${recipientName}` : ""}

${(() => {
  if (!hasGreeting && !skipGreeting && recipientName) {
    return `IMPORTANT: The draft is missing a greeting. Add an appropriate greeting at the start (e.g., "Hi ${recipientName}," or "Hey ${recipientName},") based on the user's tone.`;
  } else if (skipGreeting) {
    return "Note: User prefers no greeting - don't add one.";
  } else {
    return "";
  }
})()}

Clean up the draft to match the user's tone and writing style. Keep it concise (2-3 sentences). Return only the cleaned up draft text, no explanations.`;

    try {
      const reviewedDraft = await this.llmService.generateText(
        {
          prompt,
          systemPrompt,
          temperature: 0.3,
          maxTokens: 300,
          userId,
        },
        undefined,
        userId,
      );

      return reviewedDraft.trim();
    } catch (error) {
      this.logger.error("Error reviewing draft:", error);
      // If review fails, return original draft
      return draft;
    }
  }

  /**
   * Find an active (awaiting reply or due) follow-up for a given thread.
   * Returns null if no active follow-up exists.
   */
  async findActiveFollowUpByThread(
    userId: string,
    threadId: string,
  ): Promise<FollowUp | null> {
    return this.followUpRepository.findOne({
      where: [
        { userId, threadId, status: FollowUpStatus.AWAITING_REPLY },
        { userId, threadId, status: FollowUpStatus.FOLLOW_UP_DUE },
      ],
    });
  }

  /**
   * Get a single follow-up by ID
   */
  async getFollowUp(
    followUpId: string,
    userId: string,
  ): Promise<FollowUp | null> {
    return this.followUpRepository.findOne({
      where: { id: followUpId, userId },
    });
  }

  /**
   * Get threads in follow-up mode (user sent last, no reply received)
   */
  async getThreadsForFollowUp(userId: string): Promise<Email[]> {
    const result = await this.emailsService.getInbox(
      userId,
      false,
      "follow-up",
    );
    return result.emails;
  }

  /**
   * Calculate business days waiting since last user message in thread
   */
  async calculateWaitingDuration(
    userId: string,
    threadId: string,
  ): Promise<number> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error(ERROR_MESSAGES.NOT_CONNECTED_TO_GMAIL);
    }

    // Get thread emails
    const threadEmails = await this.emailRepository.find({
      where: { userId, threadId },
      order: { receivedAt: "DESC" },
    });

    // Find last email from user
    let lastUserMessageDate: Date | null = null;
    for (const email of threadEmails) {
      if (await this.isFromUser(email, userId)) {
        lastUserMessageDate = email.receivedAt;
        break;
      }
    }

    if (!lastUserMessageDate) {
      return 0;
    }

    // Calculate business days from last user message to now
    const now = new Date();
    return calculateBusinessDays(lastUserMessageDate, now);
  }

  /**
   * Queue background jobs to generate drafts for multiple threads
   */
  async generateDraftsForThreads(
    userId: string,
    threadIds: string[],
  ): Promise<void> {
    for (const threadId of threadIds) {
      // Check if follow-up already exists
      let followUp = await this.followUpRepository.findOne({
        where: { userId, threadId },
      });

      // If no follow-up exists, create one
      if (!followUp) {
        // Get thread info
        const threadEmails = await this.emailRepository.find({
          where: { userId, threadId },
          order: { receivedAt: "DESC" },
          take: 1,
        });

        if (threadEmails.length === 0) {
          this.logger.warn(`No emails found for thread ${threadId}`);
          continue;
        }

        const emailThread = await this.emailThreadRepository.findOne({
          where: { userId, threadId },
        });

        followUp = this.followUpRepository.create({
          userId,
          threadId,
          emailThreadId: emailThread?.id,
          status: FollowUpStatus.FOLLOW_UP_DUE,
          followUpDueAt: new Date(),
          followUpDays: 0,
          subject: threadEmails[0].subject,
          generationStatus: "pending",
        });
        followUp = await this.followUpRepository.save(followUp);
      }

      // Skip if already has draft or is currently generating
      if (
        followUp.draftFollowUp ||
        followUp.generationStatus === FOLLOW_UP_GENERATION_STATUS.GENERATING
      ) {
        continue;
      }
      // Update status to pending
      followUp.generationStatus = "pending";
      // Queue background job
      await this.followUpRepository.save(followUp);
      await this.boss.send(
        JOB_NAMES.GENERATE_FOLLOW_UP_DRAFT,
        {
          userId,
          followUpId: followUp.id,
          threadId,
        },
        {
          singletonKey: `generate-draft-${followUp.id}`,
          singletonSeconds: SECONDS.FIVE_MINUTES,
        },
      );
    }
  }
}
