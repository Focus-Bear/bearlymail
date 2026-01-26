import { Injectable, Inject, forwardRef, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { google } from "googleapis";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "./email-provider-manager.service";
import { UsersService } from "../users/users.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { isError } from "../types/common";

@Injectable()
export class EmailGmailService {
  private readonly logger = new Logger(EmailGmailService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
    private usersService: UsersService,
  ) {}

  /**
   * Fetch current star status from Gmail for debugging
   * Returns both DB starCount and Gmail star status for comparison
   */
  async getGmailStarStatus(
    userId: string,
    emailId: string,
    getEmailById: (userId: string, emailId: string) => Promise<Email>,
  ): Promise<{
    dbStarCount: number;
    gmailStarStatus: {
      isStarred: boolean;
      starCount: number;
      threadId: string;
      latestMessageLabelIds: string[];
      messageStarStatuses: Array<{
        messageIndex: number;
        messageId: string;
        isStarred: boolean;
        labelIds: string[];
      }>;
      isAnyStarred: boolean;
      starredMessageCount: number;
      error?: string;
    };
    threadInfo: {
      threadId: string;
      emailThreadId: string | null;
    };
  }> {
    const email = await getEmailById(userId, emailId);
    if (!email) {
      throw new Error("Email not found");
    }

    // Get thread info from DB
    let dbStarCount = 0;
    if (email.emailThreadId) {
      const thread = await this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId, userId },
      });
      dbStarCount = thread?.starCount || 0;
    }

    // Fetch from Gmail
    let gmailStarStatus = {
      isStarred: false,
      starCount: 0,
      threadId: email.threadId,
      latestMessageLabelIds: [] as string[],
      messageStarStatuses: [] as Array<{
        messageIndex: number;
        messageId: string;
        isStarred: boolean;
        labelIds: string[];
      }>,
      isAnyStarred: false,
      starredMessageCount: 0,
      error: undefined as string | undefined,
    };

    try {
      const user = await this.usersService.findOne(userId);
      if (!user?.googleCalendarAccessToken) {
        gmailStarStatus.error = "User not connected to Gmail";
        return {
          dbStarCount,
          gmailStarStatus,
          threadInfo: {
            threadId: email.threadId,
            emailThreadId: email.emailThreadId,
          },
        };
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

      // Get thread from Gmail
      const threadData = await gmail.users.threads.get({
        userId: "me",
        id: email.threadId,
        format: "metadata",
        metadataHeaders: ["Subject", "From"],
      });

      const thread = threadData.data;
      if (thread.messages && thread.messages.length > 0) {
        // Check all messages in the thread for STARRED label
        const messageStarStatuses = thread.messages.map((msg, idx) => {
          const labelIds = msg.labelIds || [];
          const isStarred = labelIds.includes("STARRED");
          return {
            messageIndex: idx,
            messageId: msg.id || "",
            isStarred,
            labelIds,
          };
        });

        const isAnyStarred = messageStarStatuses.some((m) => m.isStarred);
        const starredMessageCount = messageStarStatuses.filter(
          (m) => m.isStarred,
        ).length;

        // Get the latest message (last in array) for backward compatibility
        const latestMessage = thread.messages[thread.messages.length - 1];
        const latestLabelIds = latestMessage.labelIds || [];

        gmailStarStatus = {
          isStarred: isAnyStarred, // Use isAnyStarred instead of just latest message
          starCount: isAnyStarred ? 3 : 0,
          threadId: email.threadId,
          latestMessageLabelIds: latestLabelIds,
          messageStarStatuses,
          isAnyStarred,
          starredMessageCount,
          error: undefined,
        };
      } else {
        gmailStarStatus.error = "Thread has no messages";
      }
    } catch (error) {
      gmailStarStatus.error = isError(error)
        ? error.message
        : "Unknown error fetching from Gmail";
      this.logger.error("Error fetching Gmail star status:", error);
    }

    return {
      dbStarCount,
      gmailStarStatus,
      threadInfo: {
        threadId: email.threadId,
        emailThreadId: email.emailThreadId,
      },
    };
  }

  /**
   * Fetch current labels from Gmail for a specific message for debugging
   * Returns both DB labels and Gmail labels for comparison
   */
  async getGmailLabels(
    userId: string,
    emailId: string,
    getEmailById: (userId: string, emailId: string) => Promise<Email>,
  ): Promise<{
    dbLabels: {
      raw: string[] | null;
      names: string[] | null;
    };
    gmailLabels: {
      labelIds: string[];
      labelNames: string[];
      messageId: string;
      error?: string;
    };
    labelMapping: Array<{ id: string; name: string }>;
    emailInfo: {
      id: string;
      messageId: string;
      threadId: string;
    };
  }> {
    const email = await getEmailById(userId, emailId);
    if (!email) {
      throw new Error("Email not found");
    }

    // Get labels from DB (need to query raw encrypted value)
    // TypeORM automatically decrypts when using findOne, so we need to use raw query
    let dbLabelsRaw: string[] | null = null;
    const emailWithLabels = await this.emailRepository.query(
      `SELECT labels FROM emails WHERE id = $1 AND "userId" = $2`,
      [email.id, userId],
    );

    if (
      emailWithLabels &&
      emailWithLabels.length > 0 &&
      emailWithLabels[0].labels
    ) {
      try {
        const decryptedLabels = EncryptionHelper.decrypt(
          emailWithLabels[0].labels,
        );
        if (decryptedLabels) {
          dbLabelsRaw = JSON.parse(decryptedLabels);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to decrypt/parse labels for email ${email.id}:`,
          error,
        );
        dbLabelsRaw = null;
      }
    }

    // Fetch from Gmail
    let gmailLabelIds: string[] = [];
    let gmailLabelNames: string[] = [];
    let labelMapping: Array<{ id: string; name: string }> = [];
    let gmailError: string | undefined;

    try {
      const user = await this.usersService.findOne(userId);
      if (!user?.googleCalendarAccessToken) {
        gmailError = "User not connected to Gmail";
        return {
          dbLabels: {
            raw: dbLabelsRaw,
            names: dbLabelsRaw, // If stored as names, they're already names
          },
          gmailLabels: {
            labelIds: [],
            labelNames: [],
            messageId: email.messageId,
            error: gmailError,
          },
          labelMapping: [],
          emailInfo: {
            id: email.id,
            messageId: email.messageId,
            threadId: email.threadId,
          },
        };
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

      // Fetch specific message from Gmail (not thread)
      const messageData = await gmail.users.messages.get({
        userId: "me",
        id: email.messageId,
        format: "metadata",
      });

      const message = messageData.data;
      if (message.labelIds) {
        gmailLabelIds = message.labelIds;

        // Convert label IDs to names (this will filter system labels and deduplicate)
        gmailLabelNames =
          await this.emailProviderManager.convertLabelIdsToNames(
            userId,
            gmailLabelIds,
          );

        // Get the label map to show ID -> Name mapping
        // Access GmailProvider through EmailProviderManager to get the raw label map
        const provider = await this.emailProviderManager.getProvider(
          userId,
          "gmail",
        );
        if (provider && "getGmailLabels" in provider) {
          const labelMap = await (provider as any).getGmailLabels(userId);
          // Create mapping for all label IDs (including system labels for debugging)
          labelMapping = gmailLabelIds.map((id) => ({
            id,
            name: labelMap.get(id) || id,
          }));
        } else {
          // Fallback: build mapping from convertLabelIdsToNames result
          // Note: convertLabelIdsToNames filters system labels, so we need to get raw map
          const provider = await this.emailProviderManager.getProvider(
            userId,
            "gmail",
          );
          if (provider && "getGmailLabels" in provider) {
            const labelMap = await (provider as any).getGmailLabels(userId);
            labelMapping = gmailLabelIds.map((id) => ({
              id,
              name: labelMap.get(id) || id,
            }));
          } else {
            labelMapping = gmailLabelIds.map((id) => ({
              id,
              name: id, // Fallback to ID if we can't get the map
            }));
          }
        }
      } else {
        gmailError = "Message has no labelIds";
      }
    } catch (error) {
      gmailError = isError(error)
        ? error.message
        : "Unknown error fetching from Gmail";
      this.logger.error("Error fetching Gmail labels:", error);
    }

    return {
      dbLabels: {
        raw: dbLabelsRaw,
        names: dbLabelsRaw, // DB stores converted names (or IDs if not yet converted)
      },
      gmailLabels: {
        labelIds: gmailLabelIds,
        labelNames: gmailLabelNames,
        messageId: email.messageId,
        error: gmailError,
      },
      labelMapping,
      emailInfo: {
        id: email.id,
        messageId: email.messageId,
        threadId: email.threadId,
      },
    };
  }
}
