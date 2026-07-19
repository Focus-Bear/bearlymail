import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { LLM_PROVIDER_STRINGS, TONE_STYLES } from "../constants/domain-types";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { STAR_COUNTS } from "../constants/priority-constants";
import {
  HOURS_PER_DAY,
  MILLISECONDS,
  SECONDS,
} from "../constants/time-constants";
import { ContextService } from "../context/context.service";
import { WritingStyleLearningService } from "../context/writing-style-learning.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ContextKey } from "../database/entities/user-context.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { EmailThreadService } from "../emails/email-thread.service";
import { EmailsService } from "../emails/emails.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { decryptEmailEntityForApi } from "../encryption/entity-api-decrypt.util";
import { FollowUpsService } from "../follow-ups/follow-ups.service";
import { LLMProvider, LLMService } from "../llm/llm.service";
import { getJobPriority } from "../queue/job-priorities";
import { SnoozeService } from "../snooze/snooze.service";
import { UsersService } from "../users/users.service";
import {
  parseRecipientsFromString,
  sanitizeRecipientList,
} from "../utils/email-address.utils";
import { computeEmailHmac, computeRecipientsHmac } from "../utils/hmac-email";
import { logError } from "../utils/logger";
import { buildReplySubject } from "../utils/reply-subject.util";

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
  htmlBodyWithSignature: string;
  replySubject: string;
  replyToAddress: string;
  allAttachments: ReplyAttachment[];
  allInlineImages: InlineImage[];
};

// Debounce window for the per-user Q&A learning job: a burst of replies within
// this window collapses to a single extraction run (pg-boss singleton).
const QA_LEARNING_DEBOUNCE_SECONDS = SECONDS.THIRTY_MINUTES;

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
    @Inject(INJECT_TOKENS.PG_BOSS)
    private boss: PgBoss,
  ) {}

  /**
   * Ensures from/subject/body/htmlBody/etc. are plaintext before composing MIME
   * (quoted replies, forwards). Mirrors GET /emails/:id — transformers can leak ciphertext.
   */
  private ensureEmailDecryptedForReplyCompose(email: Email): void {
    decryptEmailEntityForApi(email);
  }

  async generateDraftReply(
    userId: string,
    emailId: string,
    provider?: "gemini" | "openai",
  ): Promise<string> {
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }
    this.ensureEmailDecryptedForReplyCompose(email);

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
          provider === LLM_PROVIDER_STRINGS.GEMINI
            ? LLMProvider.GEMINI
            : LLMProvider.OPENAI;
      }

      return await this.llmService.generateReplyDraft(
        {
          from: email.from,
          fromName: email.fromName,
          subject: email.subject,
          // Use compact summary to reduce token usage on downstream prompts.
          // Falls back to raw body if summary is not yet available.
          body: email.summary ?? email.body,
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
    if (tone === TONE_STYLES.CASUAL) {
      greeting = "Hey";
    } else if (tone === TONE_STYLES.FORMAL) {
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
    if (tone === TONE_STYLES.CASUAL) {
      greeting = "Hey";
    } else if (tone === TONE_STYLES.FORMAL) {
      greeting = "Dear";
    } else {
      greeting = "Hi";
    }
    let closing: string;
    if (tone === TONE_STYLES.CASUAL) {
      closing = "Thanks!";
    } else if (tone === TONE_STYLES.FORMAL) {
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
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }
    this.ensureEmailDecryptedForReplyCompose(email);

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

  private async storeSentReply(options: {
    userId: string;
    user: { name?: string | null };
    email: Email;
    sentMessage: { messageId: string };
    replySubject: string;
    bodyWithSignature: string;
    userEmail: string;
    replyToAddress: string;
    cc?: string;
  }): Promise<void> {
    const {
      userId,
      user,
      email,
      sentMessage,
      replySubject,
      bodyWithSignature,
      userEmail,
      replyToAddress,
      cc,
    } = options;
    try {
      const thread = await this.emailThreadRepository.findOne({
        where: { userId, threadId: email.threadId },
      });
      const toHmac = computeRecipientsHmac(replyToAddress || null);
      const ccHmac = computeRecipientsHmac(cc ?? null);
      const recipientEmailsHmac =
        toHmac || ccHmac ? [toHmac, ccHmac].filter(Boolean).join(",") : null;
      const sentEmail = this.emailRepository.create({
        userId,
        threadId: email.threadId,
        emailThreadId: thread?.id,
        messageId: sentMessage.messageId,
        from: userEmail,
        fromName: user.name || undefined,
        to: replyToAddress || undefined,
        cc: cc || undefined,
        subject: replySubject,
        body: bodyWithSignature,
        isRead: true,
        receivedAt: new Date(),
        labels: ["SENT"],
        senderEmailHmac: computeEmailHmac(userEmail),
        recipientEmailsHmac,
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
    const snoozeUntil = new Date(
      Date.now() + expectedReplyHours * MILLISECONDS.HOUR,
    );
    const followUpDays = Math.max(
      1,
      Math.ceil(expectedReplyHours / HOURS_PER_DAY),
    );
    const followUpDueAt = new Date();
    followUpDueAt.setDate(followUpDueAt.getDate() + followUpDays);

    // Debug #2125: log snooze vs follow-up due date to detect any timing mismatch
    // that could cause threads to appear in follow-up mode before the due date.
    const followUpHours = followUpDays * HOURS_PER_DAY;
    this.logger.warn(
      `[DEBUG #2125] createFollowUpAfterReply for thread ${email.threadId}:` +
        ` expectedReplyHours=${expectedReplyHours},` +
        ` snoozeUntil=${snoozeUntil.toISOString()},` +
        ` followUpDays=${followUpDays},` +
        ` followUpDueAt≈${followUpDueAt.toISOString()}` +
        ` (snooze=${expectedReplyHours}h, followUp=${followUpHours}h — gap=${followUpHours - expectedReplyHours}h)`,
    );

    await this.snoozeService.snoozeEmail(
      userId,
      emailId,
      `${expectedReplyHours}h`,
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
   * Build the plain-text body for a reply, appending the original message as a
   * quoted block with standard "> " indentation and an "On [date], [sender] wrote:" header.
   */
  private buildReplyQuotedBody(userText: string, originalEmail: Email): string {
    const originalBody = originalEmail.body;
    if (!originalBody) {
      return userText;
    }

    const fromDisplay = originalEmail.fromName
      ? `${originalEmail.fromName} <${originalEmail.from}>`
      : originalEmail.from;
    const dateStr = originalEmail.receivedAt.toUTCString();

    const quotedHeader = `On ${dateStr}, ${fromDisplay} wrote:`;
    const quotedBody = originalBody
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");

    return `${userText}\n\n${quotedHeader}\n${quotedBody}`;
  }

  /**
   * Build the HTML body for a reply, appending the original message inside a
   * standard <blockquote> element styled to match Gmail/Outlook/Apple Mail conventions.
   */
  private buildReplyQuotedHtmlBody(
    userHtml: string,
    originalEmail: Email,
  ): string {
    const originalHtml = originalEmail.htmlBody || originalEmail.body;
    if (!originalHtml) {
      return userHtml;
    }

    const fromDisplay = originalEmail.fromName
      ? `${originalEmail.fromName} &lt;${originalEmail.from}&gt;`
      : originalEmail.from;
    const dateStr = originalEmail.receivedAt.toUTCString();

    const quotedBlock = `<br><blockquote style="margin:0 0 0 0.8ex;border-left:1px solid #cccccc;padding-left:1ex"><div>On ${dateStr}, ${fromDisplay} wrote:</div>${originalHtml}</blockquote>`;

    return `${userHtml}${quotedBlock}`;
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
   * Gather all attachment data (user-supplied + forwarded) and resolve the
   * reply-to address.  Returns the complete payload ready for dispatch.
   */
  private async buildReplyPayload(params: {
    userId: string;
    body: string;
    email: Email;
    user: { emailSignature: string | null };
    provider: Awaited<ReturnType<EmailProviderManager["getPrimaryProvider"]>>;
    replyOptions: {
      attachments?: ReplyAttachment[];
      inlineImages?: InlineImage[];
      forwardAttachmentIds?: string[];
      recipients?: string;
      subject?: string;
      isForward?: boolean;
    };
  }): Promise<ReplyPayload> {
    const { userId, body, email, user, provider } = params;
    const options = params.replyOptions;
    const {
      attachments,
      inlineImages,
      forwardAttachmentIds,
      recipients,
      subject: customSubject,
      isForward = false,
    } = options;

    const bodyForSending = isForward
      ? this.buildForwardBody(body, email)
      : this.buildReplyQuotedBody(body, email);

    const htmlBodyForSending = isForward
      ? this.buildForwardBody(body, email)
      : this.buildReplyQuotedHtmlBody(body, email);

    const bodyWithSignature = this.appendSignature(
      bodyForSending,
      user.emailSignature,
    );
    const htmlBodyWithSignature = this.appendSignature(
      htmlBodyForSending,
      user.emailSignature,
    );

    const replySubject =
      customSubject?.trim() || buildReplySubject(email.subject, isForward);

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
      htmlBodyWithSignature,
      replySubject,
      replyToAddress,
      allAttachments: [...(attachments || []), ...forwardedAttachments],
      allInlineImages: inlineImages ?? [],
    };
  }

  /**
   * Drop unroutable entries (e.g. "undisclosed-recipients:;" copied into a
   * reply-all) from a recipient list and reject malformed addresses up front,
   * so the provider doesn't fail the whole send with an opaque error.
   */
  private sanitizeRecipientsOrThrow(
    field: "To" | "Cc" | "Bcc",
    recipientStr: string | undefined,
  ): string | undefined {
    if (!recipientStr) return undefined;
    const { sanitized, invalid } = sanitizeRecipientList(recipientStr);
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Invalid ${field} recipient(s): ${invalid.join(", ")}`,
      );
    }
    return sanitized || undefined;
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
    const { isForward = false } = options;
    const {
      bodyWithSignature,
      htmlBodyWithSignature,
      replySubject,
      allAttachments,
      allInlineImages,
    } = payload;

    const replyToAddress = this.sanitizeRecipientsOrThrow(
      "To",
      payload.replyToAddress,
    );
    const cc = this.sanitizeRecipientsOrThrow("Cc", options.cc);
    const bcc = this.sanitizeRecipientsOrThrow("Bcc", options.bcc);
    if (!replyToAddress) {
      throw new BadRequestException(
        "No valid recipient address to send this reply to.",
      );
    }

    if (isForward) {
      // Bug 3 fix: forwards go out as new standalone emails (no threadId)
      const toRecipients = parseRecipientsFromString(replyToAddress);
      const ccRecipients = cc ? parseRecipientsFromString(cc) : undefined;
      const bccRecipients = bcc ? parseRecipientsFromString(bcc) : undefined;
      const forwardAttachmentsWithInline = [
        ...allAttachments,
        ...allInlineImages,
      ];

      return provider.sendEmail(userId, {
        to: toRecipients,
        subject: replySubject,
        body: bodyWithSignature,
        cc: ccRecipients,
        bcc: bccRecipients,
        attachments:
          forwardAttachmentsWithInline.length > 0
            ? forwardAttachmentsWithInline
            : undefined,
      });
    }

    // Regular reply — thread into the existing conversation
    const attachmentsWithInline = [...allAttachments, ...allInlineImages];
    return provider.sendReply(userId, {
      threadId: email.threadId,
      to: replyToAddress,
      subject: replySubject,
      body: bodyWithSignature,
      options: {
        attachments:
          attachmentsWithInline.length > 0 ? attachmentsWithInline : undefined,
        htmlBody: htmlBodyWithSignature,
        cc: cc || undefined,
        bcc: bcc || undefined,
      },
    });
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
      subject?: string;
      isForward?: boolean;
      /**
       * User explicitly chose "Keep in Action" — preserve the thread state
       * (no follow-up, no archive). Defaults to false.
       */
      keepInAction?: boolean;
    } = {},
  ): Promise<void> {
    const {
      expectedReplyHours,
      cc,
      bcc,
      isForward = false,
      keepInAction = false,
    } = options;

    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    this.ensureEmailDecryptedForReplyCompose(email);

    const user = await this.usersService.findOne(userId);
    if (!user) throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);

    const userEmail = EncryptionHelper.tryDecrypt(user.email);

    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new Error(
        "No email provider connected. Please connect your email account.",
      );
    }

    const payload = await this.buildReplyPayload({
      userId,
      body,
      email,
      user,
      provider,
      replyOptions: options,
    });

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

    await this.storeSentReply({
      userId,
      user,
      email,
      sentMessage,
      replySubject: payload.replySubject,
      bodyWithSignature: payload.bodyWithSignature,
      userEmail,
      replyToAddress: payload.replyToAddress,
      cc,
    });

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

    // Continuously learn common Q&A pairs from what the user actually answers.
    // Debounced per user via a singleton key so a burst of replies triggers at
    // most one extraction run per window; the job batch-extracts from the
    // user's recent sent emails, where the frequency signal (a question the
    // user answers repeatedly) is meaningful. Fire-and-forget: never block or
    // fail the reply send on a best-effort learning enqueue.
    this.boss
      .send(
        JOB_NAMES.LEARN_QA_FROM_SENT,
        { userId },
        {
          singletonKey: `learn-qa-from-sent-${userId}`,
          singletonSeconds: QA_LEARNING_DEBOUNCE_SECONDS,
          priority: getJobPriority(JOB_NAMES.LEARN_QA_FROM_SENT, false),
        },
      )
      .catch((qaError) =>
        logError(
          "Failed to queue Q&A learning job",
          qaError instanceof Error ? qaError : new Error(String(qaError)),
        ),
      );

    await this.applyPostReplyThreadAction(userId, emailId, email, provider, {
      keepInAction,
      expectedReplyHours,
    });
  }

  /**
   * Routes the thread state after a reply is sent:
   * - `keepInAction` → preserve star, just clear stale follow-ups
   * - `expectedReplyHours > 0` → schedule a follow-up (snooze + downgrade star)
   * - otherwise → archive (without this the thread re-emerges in Follow-Up
   *   via the implicit "starred + sent-last" rule, see issue #2125)
   */
  private async applyPostReplyThreadAction(
    userId: string,
    emailId: string,
    email: Email,
    provider: Awaited<ReturnType<EmailProviderManager["getPrimaryProvider"]>>,
    opts: { keepInAction: boolean; expectedReplyHours?: number },
  ): Promise<void> {
    const { keepInAction, expectedReplyHours } = opts;
    if (keepInAction) {
      await this.cancelExistingFollowUp(userId, email.threadId);
      return;
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
      return;
    }
    await this.cancelExistingFollowUp(userId, email.threadId);
    try {
      await this.emailsService.archiveEmail(userId, emailId);
    } catch (archiveError) {
      this.logger.error(
        "Failed to archive thread after no-follow-up reply:",
        archiveError,
      );
    }
  }

  private async cancelExistingFollowUp(
    userId: string,
    threadId: string,
  ): Promise<void> {
    try {
      const existingFollowUp =
        await this.followUpsService.findActiveFollowUpByThread(
          userId,
          threadId,
        );
      if (existingFollowUp) {
        await this.followUpsService.cancelFollowUp(existingFollowUp.id, userId);
      }
    } catch (cancelError) {
      this.logger.warn(
        "Failed to cancel existing follow-up on reply:",
        cancelError,
      );
    }
  }
}
