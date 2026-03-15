import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { STAR_COUNTS } from "../constants/priority-constants";
import { HOURS_PER_DAY } from "../constants/time-constants";
import { ContextService } from "../context/context.service";
import { WritingStyleLearningService } from "../context/writing-style-learning.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ContextKey } from "../database/entities/user-context.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { EmailThreadService } from "../emails/email-thread.service";
import { EmailsService } from "../emails/emails.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { FollowUpsService } from "../follow-ups/follow-ups.service";
import { LLMProvider, LLMService } from "../llm/llm.service";
import { SnoozeService } from "../snooze/snooze.service";
import { UsersService } from "../users/users.service";
import { parseRecipientsFromString } from "../utils/email-address.utils";
import { logError } from "../utils/logger";

export interface ReplyRule {
  ruleId?: string;
  // e.g., "subject contains 'meeting'"
  trigger: string;
  // Reply template
  template: string;
  priority: number;
}

type ReplyAttachment = { filename: string; mimeType: string; content: Buffer };
type InlineImage = {
  contentId: string;
  filename: string;
  mimeType: string;
  content: Buffer;
};

type ReplyPayload = {
  bodyWithSignature: string;
  replySubject: string;
  replyToAddress: string;
  allAttachments: ReplyAttachment[];
  allInlineImages: InlineImage[];
};

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
      contexts.find((item) => item.contextKey === ContextKey.WRITING_STYLE_TONE)
        ?.contextValue || "professional";
    const commonPhrases = contexts
      .filter((item) => item.contextKey === ContextKey.COMMON_PHRASE)
      .map((item) => item.contextValue);
    const writingStyle = contexts.find(
      (item) => item.contextKey === ContextKey.WRITING_STYLE_TONE,
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
    _phrases: string[],
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
    _phrases: string[],
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
    const index = rules.findIndex((reply) => reply.ruleId === ruleId);
    if (index !== -1) {
      rules[index] = { ...rules[index], ...updates };
      this.replyRules.set(userId, rules);
      return rules[index];
    }
    throw new Error("Rule not found");
  }

  async deleteReplyRule(userId: string, ruleId: string): Promise<void> {
    const rules = this.replyRules.get(userId) || [];
    const filtered = rules.filter((reply) => reply.ruleId !== ruleId);
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
    const effectiveSignature =
      signature ?? "Sent from BearlyMail (anti inbox overwhelm system)";

    // Append signature with proper spacing (two line breaks before signature)
    return `${body}\n\n${effectiveSignature}`;
  }

  private async fetchForwardAttachments(
    provider: Awaited<ReturnType<EmailProviderManager["getPrimaryProvider"]>>,
    userId: string,
    email: Email,
    forwardAttachmentIds: string[],
  ): Promise<Array<{ filename: string; mimeType: string; content: Buffer }>> {
    const result: Array<{
      filename: string;
      mimeType: string;
      content: Buffer;
    }> = [];
    if (!email.attachments) return result;

    const emailAttachments = email.attachments as Array<{
      attachmentId: string;
      filename: string;
      mimeType: string;
      size: number;
    }>;
    for (const attachmentId of forwardAttachmentIds) {
      const attachmentMeta = emailAttachments.find(
        (itemA) => itemA.attachmentId === attachmentId,
      );
      if (attachmentMeta) {
        try {
          const attachmentData = await provider!.getAttachment(
            userId,
            email.messageId,
            attachmentId,
            {
              filename: attachmentMeta.filename,
              mimeType: attachmentMeta.mimeType,
              size: attachmentMeta.size,
            },
          );
          result.push({
            filename: attachmentData.filename,
            mimeType: attachmentData.mimeType,
            content: attachmentData.attachmentBuffer,
          });
        } catch (error) {
          this.logger.error(
            `Failed to fetch attachment ${attachmentId} for forwarding:`,
            error,
          );
        }
      }
    }
    return result;
  }

  private async storeSentReply(
    userId: string,
    user: { name?: string | null },
    email: Email,
    sentMessage: { messageId: string },
    replySubject: string,
    bodyWithSignature: string,
    userEmail: string,
  ): Promise<void> {
    try {
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
      this.logger.error("Failed to store sent reply in database:", storeError);
    }
  }

  private async createFollowUpAfterReply(
    userId: string,
    emailId: string,
    email: Email,
    provider: Awaited<ReturnType<EmailProviderManager["getPrimaryProvider"]>>,
    expectedReplyHours: number,
  ): Promise<void> {
    await this.snoozeService.snoozeEmail(
      userId,
      emailId,
      `${expectedReplyHours}h`,
    );
    const followUpDays = Math.max(
      1,
      Math.ceil(expectedReplyHours / HOURS_PER_DAY),
    );
    await this.followUpsService.createFollowUp(
      userId,
      email.threadId,
      followUpDays,
      emailId,
    );
    await this.emailThreadService.updateThreadStarCount(
      userId,
      email.threadId,
      STAR_COUNTS.LOW,
    );

    try {
      if (provider && "syncStarStatusToGmail" in provider) {
        await provider.syncStarStatusToGmail(
          userId,
          email.threadId,
          STAR_COUNTS.LOW,
        );
      }
    } catch (starSyncError) {
      this.logger.error(
        `Failed to sync follow-up star to provider for thread ${email.threadId}:`,
        starSyncError,
      );
    }

    this.logger.log(
      `Created follow-up for thread ${email.threadId} with ${expectedReplyHours}h expected reply time`,
    );
  }

  /**
   * Build the body for a forwarded email, prepending the conventional
   * "---------- Forwarded message ---------" header block with the original
   * email's metadata and content.
   */
  private buildForwardBody(userText: string, originalEmail: Email): string {
    const fromDisplay = originalEmail.fromName
      ? `${originalEmail.fromName} <${originalEmail.from}>`
      : originalEmail.from;

    const header = [
      "---------- Forwarded message ---------",
      `From: ${fromDisplay}`,
      `Date: ${originalEmail.receivedAt.toUTCString()}`,
      `Subject: ${originalEmail.subject}`,
      `To: ${originalEmail.to ?? ""}`,
    ].join("\n");

    // Prefer HTML body if available so rich content survives forwarding
    const originalBody = originalEmail.htmlBody || originalEmail.body || "";

    return `${userText}\n\n${header}\n\n${originalBody}`;
  }

  /**
   * Build the reply subject with the appropriate prefix (Re:/Fwd:).
   */
  private buildReplySubject(subject: string, isForward: boolean): string {
    if (isForward) {
      return subject.toLowerCase().startsWith("fwd:")
        ? subject
        : `Fwd: ${subject}`;
    }
    return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
  }

  /**
   * Gather all attachment data (user-supplied + forwarded) and resolve the
   * reply-to address.  Returns the complete payload ready for dispatch.
   */
  private async buildReplyPayload(
    userId: string,
    body: string,
    email: Email,
    user: { emailSignature: string | null },
    provider: Awaited<ReturnType<EmailProviderManager["getPrimaryProvider"]>>,
    options: {
      attachments?: ReplyAttachment[];
      inlineImages?: InlineImage[];
      forwardAttachmentIds?: string[];
      recipients?: string;
      isForward?: boolean;
    },
  ): Promise<ReplyPayload> {
    const {
      attachments,
      inlineImages,
      forwardAttachmentIds,
      recipients,
      isForward = false,
    } = options;

    // Bug 4 fix: append original email content for forwards
    const bodyForSending = isForward
      ? this.buildForwardBody(body, email)
      : body;
    const bodyWithSignature = this.appendSignature(
      bodyForSending,
      user.emailSignature,
    );

    const replySubject = this.buildReplySubject(email.subject, isForward);

    const replyToAddress =
      recipients && recipients.trim()
        ? recipients
        : email.replyTo || email.from;

    const forwardedAttachments =
      forwardAttachmentIds && forwardAttachmentIds.length > 0
        ? await this.fetchForwardAttachments(
            provider,
            userId,
            email,
            forwardAttachmentIds,
          )
        : [];

    return {
      bodyWithSignature,
      replySubject,
      replyToAddress,
      allAttachments: [...(attachments || []), ...forwardedAttachments],
      allInlineImages: inlineImages ?? [],
    };
  }

  /**
   * Send the email via the provider — forward (new thread) or reply (same thread).
   */
  private async dispatchReply(
    userId: string,
    email: Email,
    provider: NonNullable<
      Awaited<ReturnType<EmailProviderManager["getPrimaryProvider"]>>
    >,
    payload: ReplyPayload,
    options: { cc?: string; bcc?: string; isForward?: boolean },
  ): Promise<{ messageId: string; threadId: string }> {
    const { cc, bcc, isForward = false } = options;
    const {
      bodyWithSignature,
      replySubject,
      replyToAddress,
      allAttachments,
      allInlineImages,
    } = payload;

    if (isForward) {
      // Bug 3 fix: forwards go out as new standalone emails (no threadId)
      const toRecipients = parseRecipientsFromString(replyToAddress);
      const ccRecipients = cc ? parseRecipientsFromString(cc) : undefined;
      const bccRecipients = bcc ? parseRecipientsFromString(bcc) : undefined;
      const forwardAttachmentsWithInline = [
        ...allAttachments,
        ...allInlineImages,
      ];

      return provider.sendEmail(
        userId,
        toRecipients,
        replySubject,
        bodyWithSignature,
        ccRecipients,
        bccRecipients,
        forwardAttachmentsWithInline.length > 0
          ? forwardAttachmentsWithInline
          : undefined,
      );
    }

    // Regular reply — thread into the existing conversation
    const attachmentsWithInline = [...allAttachments, ...allInlineImages];
    return provider.sendReply(
      userId,
      email.threadId,
      replyToAddress,
      replySubject,
      bodyWithSignature,
      {
        attachments:
          attachmentsWithInline.length > 0 ? attachmentsWithInline : undefined,
        htmlBody: bodyWithSignature,
        cc: cc || undefined,
        bcc: bcc || undefined,
      },
    );
  }

  async sendReply(
    userId: string,
    emailId: string,
    body: string,
    options: {
      attachments?: ReplyAttachment[];
      /** Inline images to embed as CID MIME parts in the email. */
      inlineImages?: InlineImage[];
      expectedReplyHours?: number;
      forwardAttachmentIds?: string[];
      recipients?: string;
      cc?: string;
      bcc?: string;
      isForward?: boolean;
    } = {},
  ): Promise<void> {
    const { expectedReplyHours, cc, bcc, isForward = false } = options;

    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) throw new Error("Email not found");

    const user = await this.usersService.findOne(userId);
    if (!user) throw new Error("User not found");

    const userEmail = EncryptionHelper.decrypt(user.email);

    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new Error(
        "No email provider connected. Please connect your email account.",
      );
    }

    const payload = await this.buildReplyPayload(
      userId,
      body,
      email,
      user,
      provider,
      options,
    );

    const sentMessage = await this.dispatchReply(
      userId,
      email,
      provider,
      payload,
      {
        cc,
        bcc,
        isForward,
      },
    );

    await this.storeSentReply(
      userId,
      user,
      email,
      sentMessage,
      payload.replySubject,
      payload.bodyWithSignature,
      userEmail,
    );

    try {
      await this.writingStyleLearningService.learnFromSentEmailBodies(userId, [
        body,
      ]);
    } catch (learningError) {
      logError(
        "Failed to learn from sent reply",
        learningError instanceof Error
          ? learningError
          : new Error(String(learningError)),
      );
    }

    if (expectedReplyHours && expectedReplyHours > 0) {
      try {
        await this.createFollowUpAfterReply(
          userId,
          emailId,
          email,
          provider,
          expectedReplyHours,
        );
      } catch (followUpError) {
        this.logger.error("Failed to create follow-up:", followUpError);
      }
    }
  }
}
