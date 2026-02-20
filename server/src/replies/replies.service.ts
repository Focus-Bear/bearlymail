import { Injectable, Inject, forwardRef, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EmailsService } from "../emails/emails.service";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { EmailThreadService } from "../emails/email-thread.service";
import { ContextService } from "../context/context.service";
import { LLMService, LLMProvider } from "../llm/llm.service";
import { UsersService } from "../users/users.service";
import { WritingStyleLearningService } from "../context/writing-style-learning.service";
import { logError } from "../utils/logger";
import { ContextKey } from "../database/entities/user-context.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { SnoozeService } from "../snooze/snooze.service";
import { FollowUpsService } from "../follow-ups/follow-ups.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { STAR_COUNTS } from "../constants/priority-constants";

export interface ReplyRule {
  ruleId?: string;
  // e.g., "subject contains 'meeting'"
  trigger: string;
  // Reply template
  template: string;
  priority: number;
}

@Injectable()
export class RepliesService {
  private readonly logger = new Logger(RepliesService.name);
  private replyRules: Map<string, ReplyRule[]> = new Map();

  constructor(
    private emailsService: EmailsService,
    private emailProviderManager: EmailProviderManager,
    private emailThreadService: EmailThreadService,
    private contextService: ContextService,
    private llmService: LLMService,
    private usersService: UsersService,
    private writingStyleLearningService: WritingStyleLearningService,
    private snoozeService: SnoozeService,
    @Inject(forwardRef(() => FollowUpsService))
    private followUpsService: FollowUpsService,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
  ) {}

  async generateDraftReply(
    userId: string,
    emailId: string,
    provider?: "gemini" | "openai",
  ): Promise<string> {
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      throw new Error("Email not found");
    }

    // Get user context from UserContext entities
    const contexts = await this.contextService.getUserContext(userId);
    const tone =
      contexts.find((c) => c.contextKey === ContextKey.WRITING_STYLE_TONE)
        ?.contextValue || "professional";
    const commonPhrases = contexts
      .filter((c) => c.contextKey === ContextKey.COMMON_PHRASE)
      .map((c) => c.contextValue);
    const writingStyle = contexts.find(
      (c) => c.contextKey === ContextKey.WRITING_STYLE_TONE,
    )?.contextValue;

    // Get writing style examples from user.toneSettings.rules
    const user = await this.usersService.findOne(userId);
    const toneRules = user?.toneSettings?.rules || [];
    // Filter to get email examples (entries that don't start with "Tone:", "Style:", or "Common phrase:")
    const emailExamples = toneRules.filter(
      (rule: string) =>
        !rule.startsWith("Tone:") &&
        !rule.startsWith("Style:") &&
        !rule.startsWith("Common phrase:"),
    );

    // Log for debugging
    if (emailExamples.length > 0) {
      this.logger.debug(
        `Using ${emailExamples.length} email examples for reply generation`,
      );
    } else {
      this.logger.debug(
        `No email examples found in toneSettings.rules (total rules: ${toneRules.length})`,
      );
    }

    // Check for matching reply rules first
    const rules = this.replyRules.get(userId) || [];
    const matchingRule = rules.find((rule) =>
      this.matchesTrigger(email, rule.trigger),
    );

    if (matchingRule) {
      // Use rule template but enhance with LLM if needed
      const baseReply = this.applyTemplate(
        matchingRule.template,
        email,
        tone,
        commonPhrases,
      );
      // Could optionally refine with LLM here
      return baseReply;
    }

    // Use LLM to generate reply
    try {
      // Convert string provider to LLMProvider enum
      let llmProvider: LLMProvider | undefined = undefined;
      if (provider) {
        llmProvider =
          provider === "gemini" ? LLMProvider.GEMINI : LLMProvider.OPENAI;
      }

      return await this.llmService.generateReplyDraft(
        {
          from: email.from,
          fromName: email.fromName,
          subject: email.subject,
          body: email.body,
        },
        {
          tone,
          commonPhrases,
          writingStyle,
          emailExamples,
        },
        llmProvider,
        userId,
      );
    } catch (error) {
      logError(
        "LLM reply generation failed, using fallback",
        error instanceof Error ? error : new Error(String(error)),
      );
      // Fallback to default reply
      return this.generateDefaultReply(email, tone, commonPhrases);
    }
  }

  private matchesTrigger(email: Partial<Email>, trigger: string): boolean {
    if (trigger.includes("subject contains")) {
      const keyword = trigger.split("'")[1];
      return (
        email.subject?.toLowerCase().includes(keyword.toLowerCase()) || false
      );
    }
    if (trigger.includes("from contains")) {
      const keyword = trigger.split("'")[1];
      return email.from?.toLowerCase().includes(keyword.toLowerCase()) || false;
    }
    return false;
  }

  private applyTemplate(
    template: string,
    email: Partial<Email>,
    tone: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    phrases: string[],
  ): string {
    let reply = template
      .replace("{sender}", email.fromName || email.from || "there")
      .replace("{subject}", email.subject || "");

    // Add greeting based on tone
    let greeting: string;
    if (tone === "casual") {
      greeting = "Hey";
    } else if (tone === "formal") {
      greeting = "Dear";
    } else {
      greeting = "Hi";
    }
    reply = `${greeting} ${email.fromName || "there"},\n\n${reply}`;

    return reply;
  }

  private generateDefaultReply(
    email: Partial<Email>,
    tone: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    phrases: string[],
  ): string {
    let greeting: string;
    if (tone === "casual") {
      greeting = "Hey";
    } else if (tone === "formal") {
      greeting = "Dear";
    } else {
      greeting = "Hi";
    }
    let closing: string;
    if (tone === "casual") {
      closing = "Thanks!";
    } else if (tone === "formal") {
      closing = "Best regards";
    } else {
      closing = "Best";
    }

    return `${greeting} ${email.fromName || "there"},

Thank you for your email regarding "${email.subject || "this matter"}".

I'll review this and get back to you soon.

${closing}`;
  }

  async createReplyRule(userId: string, rule: ReplyRule): Promise<ReplyRule> {
    const rules = this.replyRules.get(userId) || [];
    // Simple ID generation
    rule.ruleId = `${Date.now()}-${Math.random()}`;
    rules.push(rule);
    this.replyRules.set(userId, rules);
    return rule;
  }

  async getReplyRules(userId: string): Promise<ReplyRule[]> {
    return this.replyRules.get(userId) || [];
  }

  async updateReplyRule(
    userId: string,
    ruleId: string,
    updates: Partial<ReplyRule>,
  ): Promise<ReplyRule> {
    const rules = this.replyRules.get(userId) || [];
    const index = rules.findIndex((r) => r.ruleId === ruleId);
    if (index !== -1) {
      rules[index] = { ...rules[index], ...updates };
      this.replyRules.set(userId, rules);
      return rules[index];
    }
    throw new Error("Rule not found");
  }

  async deleteReplyRule(userId: string, ruleId: string): Promise<void> {
    const rules = this.replyRules.get(userId) || [];
    const filtered = rules.filter((r) => r.ruleId !== ruleId);
    this.replyRules.set(userId, filtered);
  }

  async learnFromModification(
    userId: string,
    emailId: string,
    originalDraft: string,
    modifiedDraft: string,
  ): Promise<ReplyRule> {
    // Analyze the modification to create a new rule
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      throw new Error("Email not found");
    }

    // Simple rule generation based on email characteristics
    const trigger = `subject contains '${email.subject.split(" ")[0]}'`;
    const rule: ReplyRule = {
      trigger,
      template: modifiedDraft,
      priority: 1,
    };

    return this.createReplyRule(userId, rule);
  }

  /**
   * Appends email signature to the body if user has one configured
   */
  private appendSignature(body: string, signature: string | null): string {
    if (!signature) {
      // Use default signature if none is set
      signature = "Sent from BearlyMail (anti inbox overwhelm system)";
    }

    // Append signature with proper spacing (two line breaks before signature)
    return `${body}\n\n${signature}`;
  }

  async sendReply(
    userId: string,
    emailId: string,
    body: string,
    attachments?: Array<{
      filename: string;
      mimeType: string;
      content: Buffer;
    }>,
    expectedReplyHours?: number,
    forwardAttachmentIds?: string[],
  ): Promise<void> {
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      throw new Error("Email not found");
    }

    // Get user's email address for the "from" field
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new Error("User not found");
    }
    const userEmail = EncryptionHelper.decrypt(user.email);

    // Append signature to the body
    const bodyWithSignature = this.appendSignature(body, user.emailSignature);

    // Determine reply subject (add Re: if not already present)
    let replySubject = email.subject;
    if (!replySubject.toLowerCase().startsWith("re:")) {
      replySubject = `Re: ${replySubject}`;
    }

    // Send reply via email provider (Gmail, Outlook, etc.)
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new Error(
        "No email provider connected. Please connect your email account.",
      );
    }

    // Use Reply-To address if available, otherwise fall back to From address
    const replyToAddress = email.replyTo || email.from;

    // Fetch forward attachments if requested
    const allAttachments = attachments ? [...attachments] : [];
    if (
      forwardAttachmentIds &&
      forwardAttachmentIds.length > 0 &&
      email.attachments
    ) {
      const emailAttachments = email.attachments as Array<{
        attachmentId: string;
        filename: string;
        mimeType: string;
        size: number;
      }>;

      for (const attachmentId of forwardAttachmentIds) {
        const attachmentMeta = emailAttachments.find(
          (a) => a.attachmentId === attachmentId,
        );
        if (attachmentMeta) {
          try {
            const attachmentData = await provider.getAttachment(
              userId,
              email.messageId,
              attachmentId,
              {
                filename: attachmentMeta.filename,
                mimeType: attachmentMeta.mimeType,
                size: attachmentMeta.size,
              },
            );
            allAttachments.push({
              filename: attachmentData.filename,
              mimeType: attachmentData.mimeType,
              content: attachmentData.data,
            });
          } catch (error) {
            this.logger.error(
              `Failed to fetch attachment ${attachmentId} for forwarding:`,
              error,
            );
            // Continue with other attachments
          }
        }
      }
    }

    const sentMessage = await provider.sendReply(
      userId,
      email.threadId,
      replyToAddress,
      replySubject,
      bodyWithSignature,
      allAttachments.length > 0 ? allAttachments : undefined,
      bodyWithSignature,
    );

    // Store the sent reply in the database so it appears in the thread view
    try {
      // Get or find the email thread
      const thread = await this.emailThreadRepository.findOne({
        where: { userId, threadId: email.threadId },
      });

      const sentEmail = this.emailRepository.create({
        userId,
        threadId: email.threadId,
        emailThreadId: thread?.id,
        messageId: sentMessage.messageId,
        from: userEmail,
        fromName: user.name || undefined,
        subject: replySubject,
        body: bodyWithSignature,
        isRead: true,
        receivedAt: new Date(),
        labels: ["SENT"],
      });

      await this.emailRepository.save(sentEmail);
      this.logger.log(
        `Stored sent reply in database: messageId=${sentMessage.messageId}, threadId=${email.threadId}`,
      );
    } catch (storeError) {
      // Don't fail the send if storing fails - the email was already sent
      this.logger.error("Failed to store sent reply in database:", storeError);
    }

    // Trigger immediate learning from the sent reply
    // This will add it to toneSettings.rules if we need more examples
    try {
      await this.writingStyleLearningService.learnFromSentEmailBodies(userId, [
        body,
      ]);
    } catch (learningError) {
      // Don't fail the send if learning fails
      logError(
        "Failed to learn from sent reply",
        learningError instanceof Error
          ? learningError
          : new Error(String(learningError)),
      );
    }

    // If expected reply hours is set, snooze the email and create a follow-up
    if (expectedReplyHours && expectedReplyHours > 0) {
      try {
        // Snooze the email for the expected reply duration
        await this.snoozeService.snoozeEmail(
          userId,
          emailId,
          `${expectedReplyHours}h`,
        );

        // Create a follow-up reminder
        // Convert hours to days (rounding up to at least 1 day for the follow-up)
        const followUpDays = Math.max(1, Math.ceil(expectedReplyHours / 24));
        await this.followUpsService.createFollowUp(
          userId,
          email.threadId,
          followUpDays,
          emailId,
        );

        // Set star count to ensure the thread appears in Follow-Up mode
        // Follow-up mode requires starCount > 0, so set it to LOW (1)
        await this.emailThreadService.updateThreadStarCount(
          userId,
          email.threadId,
          STAR_COUNTS.LOW,
        );

        this.logger.log(
          `Created follow-up for thread ${email.threadId} with ${expectedReplyHours}h expected reply time`,
        );
      } catch (followUpError) {
        // Don't fail the send if follow-up creation fails
        this.logger.error("Failed to create follow-up:", followUpError);
      }
    }
  }
}
