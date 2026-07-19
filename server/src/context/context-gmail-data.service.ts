import { Injectable, Logger } from "@nestjs/common";
import { gmail_v1, google } from "googleapis";

import { createUserGoogleOAuthClient } from "../auth/google-oauth-client";
import { PROMISE_STATUS } from "../constants/domain-statuses";
import { GMAIL_LABELS } from "../constants/email-labels";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { DAYS } from "../constants/time-constants";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import {
  EmailProvider,
  RawEmailMessage,
} from "../emails/interfaces/email-provider.interface";
import { AppleMailProvider } from "../emails/providers/apple-mail.provider";
import { GmailProvider } from "../emails/providers/gmail.provider";
import {
  formatGaxiosError,
  getErrorMessage,
  getGaxiosErrorDetails,
} from "../types/common";
import { UsersService } from "../users/users.service";
import {
  buildDateRangeQuery,
  buildSentFolderQuery,
  formatGmailDate,
} from "./email-query-builder.util";

const EMAIL_FETCH_LIMIT = 400;
const NON_GMAIL_SENT_FETCH_BUFFER_MULTIPLIER = 1.5;

export interface ThreadEmail {
  id: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  receivedAt: Date;
  isRead: boolean;
  labelIds?: string[];
}

export interface ThreadData {
  id: string;
  emails: ThreadEmail[];
  updatedAt: Date;
  starCount: number;
  isArchived: boolean;
}

export interface SentEmailData {
  id: string;
  body: string;
  htmlBody?: string;
  subject: string;
  receivedAt: Date;
}

/** Progress callback used by fetchGmailThreads and related methods. */
type GmailFetchProgressCallback = (progress: {
  stage: "searching" | "fetching";
  progress: number;
  threadsFound?: number;
  threadsFetched?: number;
  totalToFetch?: number;
  findings?: string[];
}) => Promise<void>;

/**
 * Service for fetching email data from email providers for context analysis.
 * Supports Gmail, Office365, and Zoho.
 * Handles provider-specific queries, pagination, and batch fetching of threads and sent emails.
 */
@Injectable()
export class ContextEmailDataService {
  private readonly logger = new Logger(ContextEmailDataService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly emailProviderManager: EmailProviderManager,
  ) {}

  /**
   * Create an authenticated Gmail API client for a user.
   * Validates that the user has valid Gmail OAuth tokens.
   */
  private async createGmailClient(userId: string): Promise<gmail_v1.Gmail> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken || !user?.googleCalendarRefreshToken) {
      throw new Error(ERROR_MESSAGES.GMAIL_ACCESS_TOKEN_MISSING);
    }
    const oauth2Client = createUserGoogleOAuthClient(
      this.usersService,
      userId,
      user.googleCalendarAccessToken,
      user.googleCalendarRefreshToken,
    );
    return google.gmail({ version: "v1", auth: oauth2Client });
  }

  /**
   * Get the primary email provider for a user
   */
  private async getProviderForUser(userId: string): Promise<EmailProvider> {
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new Error(
        "No email provider connected - please connect Gmail, Office365, or Zoho",
      );
    }
    return provider;
  }

  /**
   * Get the provider type name for logging
   */
  private getProviderTypeName(provider: EmailProvider): string {
    // Use constructor name to identify provider type without instanceof checks
    const providerName = provider.constructor.name;
    if (providerName.includes("Gmail")) {
      return "Gmail";
    }
    if (providerName.includes("Office365") || providerName.includes("Office")) {
      return "Office365";
    }
    if (providerName.includes("Zoho")) {
      return "Zoho";
    }
    return providerName;
  }

  /**
   * Group messages by threadId and convert to ThreadData[]
   */
  private groupMessagesByThread(
    messages: RawEmailMessage[],
    provider: EmailProvider,
  ): ThreadData[] {
    // Group messages by threadId
    const threadMap = new Map<string, RawEmailMessage[]>();
    for (const message of messages) {
      const { threadId } = message;
      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, []);
      }
      threadMap.get(threadId)!.push(message);
    }

    // Convert to ThreadData[]
    const threads: ThreadData[] = [];
    for (const [threadId, threadMessages] of threadMap.entries()) {
      // Sort messages by receivedAt
      threadMessages.sort(
        (itemA, itemB) =>
          itemA.receivedAt.getTime() - itemB.receivedAt.getTime(),
      );

      // Get thread-level info from the last message
      const lastMessage = threadMessages[threadMessages.length - 1];
      const updatedAt = lastMessage.receivedAt;
      const starCount = lastMessage.starCount || 0;

      // Determine if archived (for Gmail, check labelIds; for others, assume not archived if in inbox)
      let isArchived = false;
      const providerName = provider.constructor.name;
      if (providerName.includes("Gmail")) {
        const labelIds = lastMessage.labelIds || [];
        isArchived = !labelIds.includes(GMAIL_LABELS.INBOX);
      } else {
        // For Office365 and Zoho, we assume messages are not archived if they're in the search results
        // (this is a simplification - in reality, we'd need to check folderId)
        isArchived = false;
      }

      // Convert RawEmailMessage[] to ThreadEmail[]
      const threadEmails: ThreadEmail[] = threadMessages.map((msg) => ({
        id: msg.messageId,
        from: msg.from,
        fromName: msg.fromName,
        subject: msg.subject,
        body: msg.body,
        htmlBody: msg.htmlBody,
        receivedAt: msg.receivedAt,
        isRead: msg.isRead || false,
        labelIds: msg.labelIds,
      }));

      threads.push({
        id: threadId,
        emails: threadEmails,
        updatedAt,
        starCount,
        isArchived,
      });
    }

    return threads;
  }

  /**
   * Fetch threads from email provider for analysis
   * Supports Gmail, Office365, and Zoho
   */
  async fetchThreadsFromProvider(
    userId: string,
    after: Date,
    before: Date,
    limit: number = EMAIL_FETCH_LIMIT,
    onProgress?: (progress: {
      stage: "searching" | "fetching";
      // 0-10 (out of 100 total)
      progress: number;
      threadsFound?: number;
      threadsFetched?: number;
      totalToFetch?: number;
      findings?: string[];
    }) => Promise<void>,
  ): Promise<ThreadData[]> {
    const provider = await this.getProviderForUser(userId);
    const providerType = this.getProviderTypeName(provider);

    this.logger.log(
      `[CONTEXT-ANALYSIS] Fetching threads from ${providerType} for user ${userId}`,
    );

    // For Gmail, use the thread API directly (more efficient and reliable)
    if (provider instanceof GmailProvider) {
      return await this.fetchGmailThreads(
        userId,
        after,
        before,
        limit,
        onProgress,
      );
    }

    // For Office365 and Zoho, use searchEmails and group by threadId
    const dateQuery = buildDateRangeQuery(provider, after, before);
    this.logger.log(
      `[CONTEXT-ANALYSIS] ${providerType} search query: "${dateQuery}"`,
    );

    // Fetch more messages to account for filtering and grouping by thread
    const messages = await provider.searchEmails(userId, dateQuery, limit * 2);

    this.logger.log(
      `[CONTEXT-ANALYSIS] ${providerType} returned ${messages.length} messages`,
    );

    // Filter messages by date range (in case provider doesn't fully support date queries)
    const filteredMessages = messages.filter((msg) => {
      const { receivedAt } = msg;
      return receivedAt >= after && receivedAt <= before;
    });

    if (filteredMessages.length < messages.length) {
      this.logger.log(
        `[CONTEXT-ANALYSIS] ${providerType} filtered to ${filteredMessages.length} messages in date range (from ${messages.length} total)`,
      );
    }

    // Group messages by threadId
    const threads = this.groupMessagesByThread(filteredMessages, provider);

    // Limit to requested number of threads
    const limitedThreads = threads.slice(0, limit);

    this.logger.log(
      `[CONTEXT-ANALYSIS] Successfully fetched ${limitedThreads.length} threads from ${providerType}`,
    );

    return limitedThreads;
  }

  /**
   * Get just thread IDs from Gmail (quick operation for batching)
   * Returns thread IDs without fetching full thread data
   */
  async getThreadIdsFromGmail(
    userId: string,
    after: Date,
    before: Date,
    limit: number = EMAIL_FETCH_LIMIT,
  ): Promise<string[]> {
    const gmail = await this.createGmailClient(userId);
    const gmailQuery = `after:${formatGmailDate(after)} before:${formatGmailDate(before)}`;
    this.logger.log(
      `[CONTEXT-ANALYSIS] Gmail search query for thread IDs: "${gmailQuery}"`,
    );
    const allThreadIds = await this.paginateGmailThreadIdsWithQuery(
      gmail,
      gmailQuery,
      limit,
      EMAIL_FETCH_LIMIT,
      "getThreadIdsFromGmail",
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS] Gmail returned ${allThreadIds.length} thread IDs`,
    );
    return allThreadIds;
  }

  /**
   * Provider-agnostic version of getThreadIdsFromGmail.
   * For Gmail users: delegates to the existing fast Gmail thread-ID-only path.
   * For Zoho/Office365 users: fetches via searchEmails and extracts unique thread IDs.
   * Use this instead of getThreadIdsFromGmail when the caller should support all providers.
   */
  async getThreadIdsFromProvider(
    userId: string,
    after: Date,
    before: Date,
    limit: number = EMAIL_FETCH_LIMIT,
  ): Promise<string[]> {
    const provider = await this.getProviderForUser(userId);
    const providerType = this.getProviderTypeName(provider);

    // Gmail: use the existing fast thread-ID-only path (avoids fetching full messages)
    if (provider instanceof GmailProvider) {
      return this.getThreadIdsFromGmail(userId, after, before, limit);
    }

    // Apple Mail: Mail.app has no Gmail-style search, but every message is
    // already synced locally — discover threads from BearlyMail's own store.
    if (provider instanceof AppleMailProvider) {
      const threadIds = await provider.getThreadIdsInRange(
        userId,
        after,
        before,
        limit,
      );
      this.logger.log(
        `[CONTEXT-ANALYSIS] ${providerType} returned ${threadIds.length} thread IDs (from synced store)`,
      );
      return threadIds;
    }

    // Zoho / Office365: use searchEmails and extract unique thread IDs
    const dateQuery = buildDateRangeQuery(provider, after, before);
    this.logger.log(
      `[CONTEXT-ANALYSIS] ${providerType} getThreadIdsFromProvider query: "${dateQuery}"`,
    );
    const messages = await provider.searchEmails(userId, dateQuery, limit * 3);
    const threadIds = [
      ...new Set(messages.map((msg: RawEmailMessage) => msg.threadId)),
    ].slice(0, limit) as string[];
    this.logger.log(
      `[CONTEXT-ANALYSIS] ${providerType} returned ${threadIds.length} thread IDs`,
    );
    return threadIds;
  }

  /**
   * Provider-agnostic version of fetchThreadsByIds.
   * For Gmail users: delegates to the existing fetchThreadsByIds (direct Gmail API).
   * For Zoho/Office365 users: fetches via searchEmails and groups by threadId.
   * Use this instead of fetchThreadsByIds when the caller should support all providers.
   */
  async fetchThreadsByIdsFromProvider(
    userId: string,
    threadIds: string[],
  ): Promise<ThreadData[]> {
    const provider = await this.getProviderForUser(userId);

    // Gmail: use the existing direct Gmail API path
    if (provider instanceof GmailProvider) {
      return this.fetchThreadsByIds(userId, threadIds);
    }

    // Zoho/Office365: use the direct thread-messages endpoint in parallel (not searchEmails,
    // which uses Gmail-style query syntax that Zoho's search API doesn't support)
    const results = await Promise.allSettled(
      threadIds.map((threadId) =>
        provider.fetchThreadMessages(userId, threadId),
      ),
    );
    const allMessages: RawEmailMessage[] = [];
    for (const [i, result] of results.entries()) {
      if (result.status === PROMISE_STATUS.FULFILLED) {
        allMessages.push(...result.value);
      } else {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] Failed to fetch thread ${threadIds[i]}: ${getErrorMessage(result.reason)}`,
        );
      }
    }
    return this.groupMessagesByThread(allMessages, provider);
  }

  /**
   * Get thread IDs for any connected provider (Gmail, Office365, or Zoho).
   * For Gmail: uses the direct thread-list API (fast pagination).
   * For Office365/Zoho: uses searchEmails with a date range query.
   */
  async getThreadIds(
    userId: string,
    after: Date,
    before: Date,
    limit: number = EMAIL_FETCH_LIMIT,
  ): Promise<string[]> {
    const provider = await this.getProviderForUser(userId);
    const providerType = this.getProviderTypeName(provider);

    if (providerType === "Gmail") {
      return this.getThreadIdsFromGmail(userId, after, before, limit);
    }

    // Office365 / Zoho: use searchEmails with a date range query
    const dateQuery = buildDateRangeQuery(provider, after, before);
    this.logger.log(
      `[CONTEXT-ANALYSIS] ${providerType} search query for thread IDs: "${dateQuery}"`,
    );
    try {
      const messages = await provider.searchEmails(
        userId,
        dateQuery,
        limit * 2,
      );
      const threadIds = Array.from(
        new Set(
          messages.filter((msg) => msg.threadId).map((msg) => msg.threadId),
        ),
      ).slice(0, limit);
      this.logger.log(
        `[CONTEXT-ANALYSIS] ${providerType} returned ${threadIds.length} thread IDs from ${messages.length} messages`,
      );
      return threadIds;
    } catch (error) {
      this.logger.error(
        `[CONTEXT-ANALYSIS] Error fetching thread IDs from ${providerType}: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Fetch sent thread IDs from Gmail using direct API pagination.
   */
  private async fetchGmailSentThreadIds(
    userId: string,
    limit: number,
  ): Promise<string[]> {
    const gmail = await this.createGmailClient(userId);
    const ids = await this.paginateGmailThreadIdsWithQuery(
      gmail,
      "in:sent",
      limit,
      100,
      "getSentThreadIds",
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS] Gmail returned ${ids.length} sent thread IDs (most recent)`,
    );
    return ids;
  }

  /** Shared Gmail thread-ID pagination used by getThreadIdsFromGmail and fetchGmailSentThreadIds. */
  private async paginateGmailThreadIdsWithQuery(
    gmail: gmail_v1.Gmail,
    query: string,
    limit: number,
    pageSize: number,
    callerLabel: string,
  ): Promise<string[]> {
    const allIds: string[] = [];
    let pageToken: string | undefined;
    let pageCount = 0;
    try {
      do {
        const res = await gmail.users.threads.list({
          userId: "me",
          maxResults: pageSize,
          q: query,
          pageToken,
        });
        const threads = res.data.threads || [];
        allIds.push(
          ...threads
            .map((thread) => thread.id)
            .filter((id): id is string => typeof id === "string"),
        );
        pageToken = res.data.nextPageToken || undefined;
        pageCount++;
        if (allIds.length >= limit || pageCount >= 10) {
          break;
        }
      } while (pageToken && allIds.length < limit);
    } catch (error) {
      const formattedError = formatGaxiosError(error);
      const errorDetails = getGaxiosErrorDetails(error);
      this.logger.error(
        `[CONTEXT-ANALYSIS] Gmail API error in ${callerLabel}: ${formattedError}`,
      );
      this.logger.error(
        `[CONTEXT-ANALYSIS] Gmail API error details: ${JSON.stringify(errorDetails)}`,
      );
      throw new Error(`Gmail API error fetching thread IDs: ${formattedError}`);
    }
    return allIds.slice(0, limit);
  }

  async getSentThreadIds(
    userId: string,
    limit: number = 100,
  ): Promise<string[]> {
    const provider = await this.getProviderForUser(userId);
    const providerType = this.getProviderTypeName(provider);

    if (providerType === "Gmail") {
      return this.fetchGmailSentThreadIds(userId, limit);
    }

    return this.fetchNonGmailSentThreadIds(
      userId,
      provider,
      providerType,
      limit,
    );
  }

  private async fetchNonGmailSentThreadIds(
    userId: string,
    provider: EmailProvider,
    providerType: string,
    limit: number,
  ): Promise<string[]> {
    // For Office365 and Zoho, use searchEmails and extract thread IDs
    const userRecord = await this.usersService.findOne(userId);
    const userEmailAddr = userRecord?.email
      ? userRecord.email.toLowerCase()
      : null;

    if (!userEmailAddr) {
      this.logger.warn(
        `[CONTEXT-ANALYSIS] Cannot fetch sent threads - user email not found for ${providerType}`,
      );
      return [];
    }

    try {
      const sentMessages = await provider.searchEmails(
        userId,
        `from:${userEmailAddr}`,
        limit * 2,
      );
      const threadIds = new Set<string>(
        sentMessages
          .filter((msg: RawEmailMessage) => msg.threadId)
          .map((msg) => msg.threadId),
      );
      const sentThreadIds = Array.from(threadIds).slice(0, limit);
      this.logger.log(
        `[CONTEXT-ANALYSIS] ${providerType} returned ${sentThreadIds.length} sent thread IDs from ${sentMessages.length} messages`,
      );
      return sentThreadIds;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(
        `[CONTEXT-ANALYSIS] Error fetching sent thread IDs from ${providerType}: ${errorMessage}`,
      );
      throw error;
    }
  }

  /**
   * Parse a single Gmail message into a ThreadEmail.
   * Uses flat payload structure (body directly on payload) or parts.
   */
  private parseGmailMessageToThreadEmail(
    msg: gmail_v1.Schema$Message,
  ): ThreadEmail {
    const { payload } = msg;
    const headers = payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find(
        (header) => header.name?.toLowerCase() === name.toLowerCase(),
      )?.value || "";

    const from = getHeader("From");
    const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/) || [null, from, from];
    const fromName = fromMatch[1]?.trim() || "";
    const fromEmail = fromMatch[2]?.trim() || from;

    let body = "";
    let htmlBody = "";
    if (payload?.body?.data) {
      body = Buffer.from(payload.body.data, "base64").toString("utf-8");
    } else if (payload?.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          body = Buffer.from(part.body.data, "base64").toString("utf-8");
        } else if (part.mimeType === "text/html" && part.body?.data) {
          htmlBody = Buffer.from(part.body.data, "base64").toString("utf-8");
        }
      }
    }

    const labelIds = msg.labelIds || [];
    const isRead = !labelIds.includes("UNREAD");
    return {
      id: msg.id || "",
      from: fromEmail,
      fromName: fromName || undefined,
      subject: getHeader("Subject") || "",
      body,
      htmlBody: htmlBody || undefined,
      receivedAt: new Date(parseInt(msg.internalDate || "0")),
      isRead,
      labelIds,
    };
  }

  /**
   * Fetch a single thread by ID and return its ThreadData, or null on failure.
   */
  private async fetchThreadById(
    gmail: gmail_v1.Gmail,
    threadId: string,
  ): Promise<ThreadData | null> {
    try {
      const threadResponse = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });
      const messages = threadResponse.data.messages || [];
      if (messages.length === 0) {
        return null;
      }

      const threadEmails: ThreadEmail[] = messages.map((msg) =>
        this.parseGmailMessageToThreadEmail(msg),
      );
      threadEmails.sort(
        (itemA, itemB) =>
          itemA.receivedAt.getTime() - itemB.receivedAt.getTime(),
      );

      const lastMessage = threadEmails[threadEmails.length - 1];
      const labelIds = lastMessage.labelIds || [];
      const isArchived = !labelIds.includes(GMAIL_LABELS.INBOX);
      const starCount = labelIds.filter((id) =>
        id.startsWith("STARRED"),
      ).length;

      return {
        id: threadId,
        emails: threadEmails,
        updatedAt: lastMessage.receivedAt,
        starCount,
        isArchived,
      };
    } catch (error) {
      this.logger.warn(
        `[CONTEXT-ANALYSIS] Failed to fetch thread ${threadId}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  async fetchThreadsByIds(
    userId: string,
    threadIds: string[],
  ): Promise<ThreadData[]> {
    const gmail = await this.createGmailClient(userId);
    const threadsInRange: ThreadData[] = [];
    const BATCH_SIZE = 50;

    for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
      const batch = threadIds.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((threadId) => this.fetchThreadById(gmail, threadId)),
      );
      threadsInRange.push(
        ...(batchResults.filter((thread) => thread !== null) as ThreadData[]),
      );
    }

    return threadsInRange;
  }

  /**
   * @deprecated Use fetchThreadsFromProvider instead
   * Kept for backward compatibility
   */
  async fetchThreadsFromGmail(
    userId: string,
    after: Date,
    before: Date,
    limit: number = EMAIL_FETCH_LIMIT,
    onProgress?: (progress: {
      stage: "searching" | "fetching";
      // 0-10 (out of 100 total)
      progress: number;
      threadsFound?: number;
      threadsFetched?: number;
      totalToFetch?: number;
      findings?: string[];
    }) => Promise<void>,
  ): Promise<ThreadData[]> {
    return this.fetchThreadsFromProvider(
      userId,
      after,
      before,
      limit,
      onProgress,
    );
  }

  /**
   * Parse a Gmail message payload to extract body text and HTML.
   */
  private parseGmailMessageBody(
    payload: gmail_v1.Schema$MessagePart | undefined,
  ): { body: string; htmlBody: string } {
    let body = "";
    let htmlBody = "";
    const extractBody = (part: gmail_v1.Schema$MessagePart) => {
      if (part.body?.data) {
        const text = Buffer.from(part.body.data, "base64").toString("utf-8");
        if (part.mimeType === "text/html") {
          htmlBody += text;
        } else if (part.mimeType === "text/plain") {
          body += text;
        }
      }
      if (part.parts) {
        part.parts.forEach(extractBody);
      }
    };
    if (payload) {
      extractBody(payload);
    }
    return { body, htmlBody };
  }

  /**
   * Fetch and parse a single Gmail thread into ThreadData.
   * Records sender findings for progress reporting (mutates uniqueSenders and interestingSubjects).
   */
  private async fetchAndParseThread(
    gmail: gmail_v1.Gmail,
    threadId: string,
    uniqueSenders: Set<string>,
    interestingSubjects: string[],
  ): Promise<ThreadData | null> {
    try {
      const threadResponse = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });
      const thread = threadResponse.data;
      const messages = thread.messages || [];
      if (messages.length === 0) {
        return null;
      }

      const lastMessage = messages[messages.length - 1];
      const labelIds = lastMessage.labelIds || [];
      const isArchived = !labelIds.includes(GMAIL_LABELS.INBOX);
      const starCount = labelIds.includes(GMAIL_LABELS.STARRED) ? 3 : 0;
      const updatedAt = new Date(parseInt(lastMessage.internalDate || "0"));

      const threadEmails: ThreadEmail[] = messages.map(
        (message: gmail_v1.Schema$Message) => {
          const headers = message.payload?.headers || [];
          const fromHeader =
            headers.find((header) => header.name === "From")?.value || "";
          const subject =
            headers.find((header) => header.name === "Subject")?.value ||
            "(No Subject)";
          const fromMatch = fromHeader.match(/(.*)<(.+)>/) || [
            null,
            fromHeader,
            fromHeader,
          ];
          const fromName = fromMatch[1]?.trim() || "";
          const from = fromMatch[2] || fromHeader;
          const { body, htmlBody } = this.parseGmailMessageBody(
            message.payload,
          );
          const receivedAt = new Date(parseInt(message.internalDate || "0"));
          const isRead = !labelIds.includes("UNREAD");
          return {
            id: message.id,
            from,
            fromName: fromName || undefined,
            subject,
            body,
            htmlBody: htmlBody || undefined,
            receivedAt,
            isRead,
            labelIds: message.labelIds || [],
          };
        },
      );

      const firstEmail = threadEmails[0];
      if (firstEmail) {
        const sender = firstEmail.fromName || firstEmail.from;
        if (!uniqueSenders.has(sender)) {
          uniqueSenders.add(sender);
          if (uniqueSenders.size <= 5) {
            const senderDisplay =
              firstEmail.fromName || firstEmail.from.split("@")[0];
            interestingSubjects.push(
              `📧 ${senderDisplay}: "${firstEmail.subject.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH)}${firstEmail.subject.length > QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH ? "..." : ""}"`,
            );
          }
        }
      }

      return {
        id: threadId,
        emails: threadEmails,
        updatedAt,
        starCount,
        isArchived,
      };
    } catch (error: unknown) {
      this.logger.warn(
        `[CONTEXT-ANALYSIS] Failed to fetch thread ${threadId}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * Paginate through Gmail threads.list to collect thread IDs.
   * Reports search progress via the optional callback.
   */
  private async paginateGmailThreadIds(
    gmail: gmail_v1.Gmail,
    gmailQuery: string,
    limit: number,
    onProgress: GmailFetchProgressCallback | undefined,
  ): Promise<string[]> {
    const allThreadIds: string[] = [];
    let nextPageToken: string | undefined;
    let pageCount = 0;
    const maxPages = 10;

    if (onProgress) {
      await onProgress({
        stage: "searching",
        progress: 1,
        threadsFound: 0,
        findings: ["Searching your Gmail inbox..."],
      });
    }

    do {
      const response = await gmail.users.threads.list({
        userId: "me",
        maxResults: 400,
        q: gmailQuery,
        pageToken: nextPageToken,
      });
      const threads = response.data.threads || [];
      allThreadIds.push(
        ...threads
          .map((thread) => thread.id)
          .filter((id): id is string => typeof id === "string"),
      );
      nextPageToken = response.data.nextPageToken || undefined;
      pageCount++;
      this.logger.log(
        `[CONTEXT-ANALYSIS] Gmail page ${pageCount}: found ${threads.length} threads (total so far: ${allThreadIds.length})`,
      );

      if (onProgress) {
        const searchProgress = Math.min(3, 1 + (pageCount * 2) / maxPages);
        await onProgress({
          stage: "searching",
          progress: searchProgress,
          threadsFound: allThreadIds.length,
          findings: [
            `Found ${allThreadIds.length} threads${allThreadIds.length >= limit ? " (limit reached)" : ""}...`,
          ],
        });
      }
      if (pageCount >= maxPages) {
        this.logger.log(
          `[CONTEXT-ANALYSIS] Reached max pages (${maxPages}), stopping pagination`,
        );
        break;
      }
    } while (nextPageToken && allThreadIds.length < limit);

    return allThreadIds.slice(0, limit);
  }

  /**
   * Fetch full thread details in parallel batches.
   * Reports fetch progress via the optional callback.
   */
  private async batchFetchThreadDetails(
    gmail: gmail_v1.Gmail,
    allThreadIds: string[],
    onProgress: GmailFetchProgressCallback | undefined,
  ): Promise<ThreadData[]> {
    const threadsInRange: ThreadData[] = [];
    const uniqueSenders = new Set<string>();
    const interestingSubjects: string[] = [];
    const FETCH_BATCH_SIZE = 50;

    this.logger.log(
      `[CONTEXT-ANALYSIS] Fetching full details for ${allThreadIds.length} threads from Gmail in parallel batches...`,
    );

    if (onProgress) {
      await onProgress({
        stage: "fetching",
        progress: 3,
        threadsFound: allThreadIds.length,
        threadsFetched: 0,
        totalToFetch: allThreadIds.length,
        findings: [`Fetching details for ${allThreadIds.length} threads...`],
      });
    }

    const totalBatchesToFetch = Math.ceil(
      allThreadIds.length / FETCH_BATCH_SIZE,
    );
    for (let i = 0; i < allThreadIds.length; i += FETCH_BATCH_SIZE) {
      const batch = allThreadIds.slice(i, i + FETCH_BATCH_SIZE);
      const batchNum = Math.floor(i / FETCH_BATCH_SIZE) + 1;
      this.logger.log(
        `[CONTEXT-ANALYSIS] Fetching batch ${batchNum}/${totalBatchesToFetch} (threads ${i + 1}-${Math.min(i + FETCH_BATCH_SIZE, allThreadIds.length)})...`,
      );

      const batchResults = await Promise.all(
        batch.map((threadId) =>
          this.fetchAndParseThread(
            gmail,
            threadId,
            uniqueSenders,
            interestingSubjects,
          ),
        ),
      );
      threadsInRange.push(
        ...batchResults.filter(
          (thread): thread is ThreadData => thread !== null,
        ),
      );

      if (onProgress) {
        const fetchProgress =
          3 +
          Math.floor((threadsInRange.length / allThreadIds.length) * DAYS.WEEK);
        const currentFindings = [
          `Fetched ${threadsInRange.length}/${allThreadIds.length} threads...`,
          ...interestingSubjects.slice(0, 3),
        ];
        if (uniqueSenders.size > 5) {
          currentFindings.push(`...and ${uniqueSenders.size - 5} more senders`);
        }
        await onProgress({
          stage: "fetching",
          progress: fetchProgress,
          threadsFound: allThreadIds.length,
          threadsFetched: threadsInRange.length,
          totalToFetch: allThreadIds.length,
          findings: currentFindings,
        });
      }
    }

    this.logger.log(
      `[CONTEXT-ANALYSIS] Successfully fetched ${threadsInRange.length} threads from Gmail`,
    );
    return threadsInRange;
  }

  private async fetchGmailThreads(
    userId: string,
    after: Date,
    before: Date,
    limit: number,
    onProgress?: GmailFetchProgressCallback,
  ): Promise<ThreadData[]> {
    const gmail = await this.createGmailClient(userId);
    const gmailQuery = `after:${formatGmailDate(after)} before:${formatGmailDate(before)}`;
    this.logger.log(`[CONTEXT-ANALYSIS] Gmail search query: "${gmailQuery}"`);

    const allThreadIds = await this.paginateGmailThreadIds(
      gmail,
      gmailQuery,
      limit,
      onProgress,
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS] Gmail returned ${allThreadIds.length} thread IDs total`,
    );

    return this.batchFetchThreadDetails(gmail, allThreadIds, onProgress);
  }

  /**
   * Fetch sent email threads from email provider for writing style analysis
   * Supports Gmail, Office365, and Zoho
   */
  async fetchSentThreadsFromProvider(
    userId: string,
    userEmail: string,
    after: Date,
    before: Date,
    limit: number = 100,
  ): Promise<SentEmailData[]> {
    const provider = await this.getProviderForUser(userId);
    const providerType = this.getProviderTypeName(provider);

    this.logger.log(
      `[CONTEXT-ANALYSIS] Fetching sent emails from ${providerType} for user ${userId}`,
    );

    // Build sent folder query for the provider
    const sentQuery = buildSentFolderQuery(provider, after, before);
    this.logger.log(
      `[CONTEXT-ANALYSIS] ${providerType} sent query: "${sentQuery}"`,
    );

    // Phase 3: Reduced from limit*2 to limit — the sentQuery already includes date-range
    // filters (after:/before: for Gmail, receivedDateTime for Office365, receivedTime for
    // Zoho), so the 2x over-fetch was redundant for Gmail and wasteful in general.
    // For non-Gmail providers where query filters may be less reliable, we keep a 1.5x
    // buffer to ensure we still get enough results after date filtering.
    const fetchLimit = provider.constructor.name.includes("Gmail")
      ? limit
      : Math.ceil(limit * NON_GMAIL_SENT_FETCH_BUFFER_MULTIPLIER);
    const messages = await provider.searchEmails(userId, sentQuery, fetchLimit);

    this.logger.log(
      `[CONTEXT-ANALYSIS] ${providerType} returned ${messages.length} sent messages`,
    );

    // Filter by date range; convert to SentEmailData[]; limit
    const filtered = messages.filter(
      (msg) => msg.receivedAt >= after && msg.receivedAt <= before,
    );
    if (filtered.length < messages.length) {
      this.logger.log(
        `[CONTEXT-ANALYSIS] ${providerType} filtered to ${filtered.length} sent messages in date range (from ${messages.length} total)`,
      );
    }
    const limitedSentEmails = filtered.slice(0, limit).map((msg) => ({
      id: msg.messageId,
      body: msg.body,
      htmlBody: msg.htmlBody,
      subject: msg.subject,
      receivedAt: msg.receivedAt,
    }));
    this.logger.log(
      `[CONTEXT-ANALYSIS] Successfully fetched ${limitedSentEmails.length} sent emails from ${providerType}`,
    );
    return limitedSentEmails;
  }
}

// Alias for backward compatibility with existing imports
export { ContextEmailDataService as ContextGmailDataService };
