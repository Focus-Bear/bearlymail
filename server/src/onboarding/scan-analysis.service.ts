import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { gmail_v1, google } from "googleapis";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { MILLISECONDS } from "../constants/time-constants";
import { ContextService } from "../context/context.service";
import { ScanEmail } from "../database/entities/scan-email.entity";
import { ContextKey, Source } from "../database/entities/user-context.entity";
import { ScanEmailService } from "../emails/scan-email.service";
import { LLMService } from "../llm/llm.service";
import { UsersService } from "../users/users.service";

@Injectable()
export class ScanAnalysisService {
  private readonly logger = new Logger(ScanAnalysisService.name);

  constructor(
    @InjectRepository(ScanEmail)
    private scanEmailRepository: Repository<ScanEmail>,
    private scanEmailService: ScanEmailService,
    private contextService: ContextService,
    private usersService: UsersService,
    private llmService: LLMService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  /**
   * Analyze all scanned emails and create user context (VIP contacts, etc.)
   * Called after scan completes
   */
  async analyzeScanResults(userId: string): Promise<void> {
    this.logger.log(`Starting analysis of scan results for user ${userId}`);

    try {
      const scanEmails = await this.scanEmailService.findAllForUser(userId);
      if (scanEmails.length === 0) {
        this.logger.warn(
          `No scan emails found for user ${userId}, skipping analysis`,
        );
        return;
      }

      this.logger.log(
        `Analyzing ${scanEmails.length} scanned emails for user ${userId}`,
      );

      // Enrich scan emails with reply/archive data from Gmail
      await this.enrichScanEmails(userId, scanEmails);

      // Create VIP contacts from patterns
      await this.createVipContacts(userId, scanEmails);

      // Analyze labels and create categories
      await this.analyzeLabelsAndCreateCategories(userId, scanEmails);

      // Create user context from scanned emails
      await this.createUserContext(userId, scanEmails);

      // Delete temporary scan emails
      await this.scanEmailService.deleteAllForUser(userId);
      this.logger.log(
        `Deleted ${scanEmails.length} temporary scan emails for user ${userId}`,
      );

      this.logger.log(`Completed analysis for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Error analyzing scan results for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Enrich scan emails with reply time and archive status from Gmail threads
   */
  private async enrichScanEmails(
    userId: string,
    scanEmails: ScanEmail[],
  ): Promise<void> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      this.logger.warn(`User ${userId} not connected, skipping enrichment`);
      return;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const threadMap = new Map<string, ScanEmail[]>();
    for (const email of scanEmails) {
      if (!threadMap.has(email.threadId)) {
        threadMap.set(email.threadId, []);
      }
      threadMap.get(email.threadId)!.push(email);
    }

    for (const [threadId, emails] of threadMap.entries()) {
      try {
        await this.analyzeThreadForEnrichment(threadId, emails, gmail);
      } catch (error) {
        this.logger.warn(`Failed to enrich thread ${threadId}:`, error);
      }
    }

    await this.scanEmailRepository.save(scanEmails);
  }

  private async analyzeThreadForEnrichment(
    threadId: string,
    emails: ScanEmail[],
    gmail: ReturnType<typeof google.gmail>,
  ): Promise<void> {
    const thread = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    const messages = thread.data.messages || [];
    const originalEmail = emails[0];

    const replyMessage = messages.find((msg: gmail_v1.Schema$Message) => {
      const labelIds = msg.labelIds || [];
      return labelIds.includes("SENT");
    });

    if (replyMessage && originalEmail.receivedAt) {
      const replyDate = new Date(parseInt(replyMessage.internalDate || "0"));
      const receivedDate = originalEmail.receivedAt;
      const hoursToReply =
        (replyDate.getTime() - receivedDate.getTime()) / MILLISECONDS.HOUR;
      originalEmail.timeToReply = Math.max(0, hoursToReply);
      originalEmail.wasRepliedTo = true;
    }

    const lastMessage = messages[messages.length - 1];
    const lastLabelIds = lastMessage.labelIds || [];
    const isArchived = !lastLabelIds.includes("INBOX");

    for (const email of emails) {
      email.isArchived = isArchived;
      if (isArchived && !email.archivedAt) {
        email.archivedAt = email.receivedAt;
      }
    }
  }

  /**
   * Create VIP contacts based on email patterns
   */
  private async createVipContacts(
    userId: string,
    scanEmails: ScanEmail[],
  ): Promise<void> {
    // Analyze senders user replied to quickly
    const quickReplySenders = new Map<
      string,
      { count: number; avgHours: number; name: string }
    >();
    const starredSenders = new Map<string, { count: number; name: string }>();

    for (const email of scanEmails) {
      const sender = email.from;
      const senderName = email.fromName || sender;

      // Quick replies (within 2 hours) - indicates VIP
      if (
        email.wasRepliedTo &&
        email.timeToReply !== null &&
        email.timeToReply <= 2
      ) {
        const existing = quickReplySenders.get(sender) || {
          count: 0,
          avgHours: 0,
          name: senderName,
        };
        existing.count++;
        existing.avgHours =
          (existing.avgHours * (existing.count - 1) + email.timeToReply) /
          existing.count;
        quickReplySenders.set(sender, existing);
      }

      // Starred emails (starCount > 0) - indicates VIP
      if (email.starCount > 0) {
        const existing = starredSenders.get(sender) || {
          count: 0,
          name: senderName,
        };
        existing.count++;
        starredSenders.set(sender, existing);
      }
    }

    // Create VIP contacts for quick reply senders
    // Lower threshold: at least 1 quick reply (was 2) to improve detection
    for (const [, senderData] of quickReplySenders.entries()) {
      if (senderData.count >= 1) {
        // At least 1 quick reply within 2 hours indicates priority
        await this.contextService.createOrUpdateContext(
          userId,
          ContextKey.VIP_CONTACT,
          senderData.name,
          Source.AUTOGENERATED,
        );
        this.logger.log(
          `Created VIP contact for quick-reply sender: ${senderData.name} (${senderData.count} quick replies, avg ${senderData.avgHours.toFixed(1)}h)`,
        );
      }
    }

    // Create VIP contacts for starred senders
    // Lower threshold: at least 2 starred emails (was 3) to improve detection
    for (const [, senderData] of starredSenders.entries()) {
      if (senderData.count >= 2) {
        // Starred at least 2 times (was 3) indicates priority
        await this.contextService.createOrUpdateContext(
          userId,
          ContextKey.VIP_CONTACT,
          senderData.name,
          Source.AUTOGENERATED,
        );
        this.logger.log(
          `Created VIP contact for starred sender: ${senderData.name} (${senderData.count} starred emails)`,
        );
      }
    }
  }

  /**
   * Analyze labels from scanned emails and create categories from custom labels
   */
  private async analyzeLabelsAndCreateCategories(
    userId: string,
    scanEmails: ScanEmail[],
  ): Promise<void> {
    this.logger.log(
      `Starting label analysis for user ${userId} (${scanEmails.length} emails)`,
    );

    // Collect all unique labels from scanned emails
    const allLabels = new Set<string>();
    for (const email of scanEmails) {
      if (email.labels && Array.isArray(email.labels)) {
        for (const label of email.labels) {
          if (label && typeof label === "string") {
            allLabels.add(label);
          }
        }
      }
    }

    if (allLabels.size === 0) {
      this.logger.log(`No labels found in scanned emails for user ${userId}`);
      return;
    }

    this.logger.log(
      `Found ${allLabels.size} unique labels, analyzing with LLM...`,
    );

    // Call LLM to identify custom labels that could be categories
    const customLabels = await this.llmService.identifyCustomLabels(
      Array.from(allLabels),
      undefined,
      userId,
    );

    if (customLabels.length === 0) {
      this.logger.log(`No custom labels identified for user ${userId}`);
      return;
    }

    this.logger.log(
      `Identified ${customLabels.length} custom labels, creating categories...`,
    );

    // Create categories from high and medium confidence labels
    let createdCount = 0;
    for (const labelData of customLabels) {
      if (
        labelData.confidence === "HIGH" ||
        labelData.confidence === "MEDIUM"
      ) {
        await this.contextService.createOrUpdateContext(
          userId,
          ContextKey.EMAIL_CATEGORY,
          `${labelData.categoryName} - ${labelData.description}`,
          Source.AUTOGENERATED,
        );
        createdCount++;
        this.logger.log(
          `Created category: ${labelData.categoryName} (from label: ${labelData.label}, confidence: ${labelData.confidence})`,
        );
      } else {
        this.logger.log(
          `Skipped low confidence label: ${labelData.label} (${labelData.confidence})`,
        );
      }
    }

    this.logger.log(
      `Created ${createdCount} categories from custom labels for user ${userId}`,
    );
  }

  /**
   * Create user context from scanned emails
   */
  private async createUserContext(
    userId: string,
    scanEmails: ScanEmail[],
  ): Promise<void> {
    // Calculate average reply time (store as context for future use)
    const repliedEmails = scanEmails.filter(
      (emailEntry) =>
        emailEntry.wasRepliedTo &&
        emailEntry.timeToReply !== null &&
        emailEntry.timeToReply > 0,
    );
    if (repliedEmails.length > 0) {
      const avgReplyTime =
        repliedEmails.reduce(
          (sum, emailEntry) => sum + (emailEntry.timeToReply || 0),
          0,
        ) / repliedEmails.length;
      await this.contextService.createOrUpdateContext(
        userId,
        ContextKey.AVERAGE_REPLY_TIME,
        avgReplyTime.toFixed(2),
        Source.AUTOGENERATED,
      );
      this.logger.log(
        `User average reply time: ${avgReplyTime.toFixed(2)} hours`,
      );
    }

    this.logger.log(`Created user context from scan analysis`);
  }
}
