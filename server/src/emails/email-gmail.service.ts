import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { google } from "googleapis";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { formatGaxiosError, isError } from "../types/common";
import { UsersService } from "../users/users.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { parseLabelsValue } from "./labels.util";

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

  private async fetchGmailThreadStarStatus(
    userId: string,
    threadId: string,
  ): Promise<{
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
  }> {
    const result = {
      isStarred: false,
      starCount: 0,
      threadId,
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

    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      result.error = ERROR_MESSAGES.NOT_CONNECTED_TO_GMAIL;
      return result;
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
    const threadData = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "metadata",
      metadataHeaders: ["Subject", "From"],
    });

    const thread = threadData.data;
    if (thread.messages && thread.messages.length > 0) {
      const messageStarStatuses = thread.messages.map((msg, idx) => {
        const labelIds = msg.labelIds || [];
        return {
          messageIndex: idx,
          messageId: msg.id || "",
          isStarred: labelIds.includes("STARRED"),
          labelIds,
        };
      });

      const isAnyStarred = messageStarStatuses.some((msg) => msg.isStarred);
      const latestMessage = thread.messages[thread.messages.length - 1];

      return {
        isStarred: isAnyStarred,
        starCount: isAnyStarred ? 3 : 0,
        threadId,
        latestMessageLabelIds: latestMessage.labelIds || [],
        messageStarStatuses,
        isAnyStarred,
        starredMessageCount: messageStarStatuses.filter((msg) => msg.isStarred)
          .length,
        error: undefined,
      };
    }

    result.error = "Thread has no messages";
    return result;
  }

  private async getDbEmailLabels(email: Email): Promise<string[] | null> {
    const emailWithLabels = await this.emailRepository.query(
      `SELECT labels FROM emails WHERE id = $1 AND "userId" = $2`,
      [email.id, email.userId],
    );

    if (emailWithLabels?.length > 0 && emailWithLabels[0].labels) {
      const decryptedLabels = EncryptionHelper.tryDecrypt(
        emailWithLabels[0].labels,
      );
      if (decryptedLabels) {
        // Accept both JSON and legacy Postgres array-literal labels; never
        // throw (avoids a WARN + stack per call on legacy rows).
        const parsed = parseLabelsValue(decryptedLabels);
        if (parsed !== null) return parsed;
        this.logger.debug(
          `Unparseable labels for email ${email.id} — ignoring`,
        );
      }
    }
    return null;
  }

  private async fetchGmailMessageLabelData(
    userId: string,
    email: Email,
  ): Promise<{
    gmailLabelIds: string[];
    gmailLabelNames: string[];
    labelMapping: Array<{ id: string; name: string }>;
    gmailError?: string;
  }> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      return {
        gmailLabelIds: [],
        gmailLabelNames: [],
        labelMapping: [],
        gmailError: ERROR_MESSAGES.NOT_CONNECTED_TO_GMAIL,
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
    const messageData = await gmail.users.messages.get({
      userId: "me",
      id: email.messageId,
      format: "metadata",
    });

    const message = messageData.data;
    if (!message.labelIds) {
      return {
        gmailLabelIds: [],
        gmailLabelNames: [],
        labelMapping: [],
        gmailError: "Message has no labelIds",
      };
    }

    const gmailLabelIds = message.labelIds;
    const gmailLabelNames =
      await this.emailProviderManager.convertLabelIdsToNames(
        userId,
        gmailLabelIds,
      );
    const provider = await this.emailProviderManager.getProvider(
      userId,
      "gmail",
    );

    let labelMapping: Array<{ id: string; name: string }>;
    if (provider && "getGmailLabels" in provider) {
      const labelMap = await (
        provider as {
          getGmailLabels: (userId: string) => Promise<Map<string, string>>;
        }
      ).getGmailLabels(userId);
      labelMapping = gmailLabelIds.map((id) => ({
        id,
        name: labelMap.get(id) || id,
      }));
    } else {
      labelMapping = gmailLabelIds.map((id) => ({ id, name: id }));
    }

    return { gmailLabelIds, gmailLabelNames, labelMapping };
  }

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
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
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
    let gmailStarStatus;
    try {
      gmailStarStatus = await this.fetchGmailThreadStarStatus(
        userId,
        email.threadId,
      );
    } catch (error) {
      gmailStarStatus = {
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
        error: isError(error)
          ? error.message
          : "Unknown error fetching from Gmail",
      };
      this.logger.error(
        `Error fetching Gmail star status: ${formatGaxiosError(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
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
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }

    const dbLabelsRaw = await this.getDbEmailLabels(email);

    let gmailLabelIds: string[] = [];
    let gmailLabelNames: string[] = [];
    let labelMapping: Array<{ id: string; name: string }> = [];
    let gmailError: string | undefined;

    try {
      const result = await this.fetchGmailMessageLabelData(userId, email);
      ({ gmailLabelIds, gmailLabelNames, labelMapping, gmailError } = result);
    } catch (error) {
      gmailError = isError(error)
        ? error.message
        : "Unknown error fetching from Gmail";
      this.logger.error(
        `Error fetching Gmail labels: ${formatGaxiosError(error)}`,
      );
    }

    return {
      dbLabels: { raw: dbLabelsRaw, names: dbLabelsRaw },
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
