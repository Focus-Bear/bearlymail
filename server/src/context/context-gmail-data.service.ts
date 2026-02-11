import { Injectable, Logger } from "@nestjs/common";
import { UsersService } from "../users/users.service";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import {
  EmailProvider,
  RawEmailMessage,
} from "../emails/interfaces/email-provider.interface";
import { QUERY_LIMITS } from "../constants/query-limits";
import { DAYS } from "../constants/time-constants";
import { GmailProvider } from "../emails/providers/gmail.provider";
import { GMAIL_LABELS } from "../constants/email-labels";
import {
  getErrorMessage,
  formatGaxiosError,
  getGaxiosErrorDetails,
} from "../types/common";
import { google, gmail_v1 } from "googleapis";

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
    if (providerName.includes("Gmail")) return "Gmail";
    if (providerName.includes("Office365") || providerName.includes("Office"))
      return "Office365";
    if (providerName.includes("Zoho")) return "Zoho";
    return providerName;
  }

  /**
   * Format date for Gmail search query (YYYY/MM/DD format)
   */
  private formatGmailDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
  }

  /**
   * Format date for Office365 filter (ISO 8601 format)
   */
  private formatOffice365Date(date: Date): string {
    return date.toISOString();
  }

  /**
   * Format date for Zoho search (Unix timestamp in seconds)
   */
  private formatZohoDate(date: Date): string {
    return Math.floor(date.getTime() / 1000).toString();
  }

  /**
   * Build date range query for a provider
   */
  private buildDateRangeQuery(
    provider: EmailProvider,
    after: Date,
    before: Date,
  ): string {
    const providerName = provider.constructor.name;

    if (providerName.includes("Gmail")) {
      const gmailAfter = this.formatGmailDate(after);
      const gmailBefore = this.formatGmailDate(before);
      return `after:${gmailAfter} before:${gmailBefore}`;
    } else if (
      providerName.includes("Office365") ||
      providerName.includes("Office")
    ) {
      // Office365 uses $filter with receivedDateTime
      // Format: receivedDateTime ge {ISO_DATE} and receivedDateTime le {ISO_DATE}
      const afterISO = this.formatOffice365Date(after);
      const beforeISO = this.formatOffice365Date(before);
      // Note: searchEmails uses $search, but we'll pass the filter format
      // The Office365 provider will need to handle this
      // For now, return a format that Office365 can understand
      return `receivedDateTime ge ${afterISO} and receivedDateTime le ${beforeISO}`;
    } else if (providerName.includes("Zoho")) {
      // Zoho uses Unix timestamps
      const afterUnix = this.formatZohoDate(after);
      const beforeUnix = this.formatZohoDate(before);
      return `receivedTime >= ${afterUnix} AND receivedTime <= ${beforeUnix}`;
    }
    // Fallback: try Gmail format
    const gmailAfter = this.formatGmailDate(after);
    const gmailBefore = this.formatGmailDate(before);
    return `after:${gmailAfter} before:${gmailBefore}`;
  }

  /**
   * Build sent folder query for a provider
   */
  private buildSentFolderQuery(
    provider: EmailProvider,
    after: Date,
    before: Date,
  ): string {
    const providerName = provider.constructor.name;

    if (providerName.includes("Gmail")) {
      const gmailAfter = this.formatGmailDate(after);
      const gmailBefore = this.formatGmailDate(before);
      return `after:${gmailAfter} before:${gmailBefore} in:sent`;
    } else if (
      providerName.includes("Office365") ||
      providerName.includes("Office")
    ) {
      // Office365 sent items folder
      const afterISO = this.formatOffice365Date(after);
      const beforeISO = this.formatOffice365Date(before);
      return `receivedDateTime ge ${afterISO} and receivedDateTime le ${beforeISO} and isSent eq true`;
    } else if (providerName.includes("Zoho")) {
      // Zoho sent folder
      const afterUnix = this.formatZohoDate(after);
      const beforeUnix = this.formatZohoDate(before);
      return `receivedTime >= ${afterUnix} AND receivedTime <= ${beforeUnix} AND folderid:sent`;
    }
    // Fallback
    const gmailAfter = this.formatGmailDate(after);
    const gmailBefore = this.formatGmailDate(before);
    return `after:${gmailAfter} before:${gmailBefore} in:sent`;
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
        (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime(),
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
    limit: number = 400,
    onProgress?: (progress: {
      stage: "searching" | "fetching";
      progress: number; // 0-10 (out of 100 total)
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
    const dateQuery = this.buildDateRangeQuery(provider, after, before);
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
    limit: number = 400,
  ): Promise<string[]> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken || !user?.googleCalendarRefreshToken) {
      throw new Error("Gmail access token missing - please log in again");
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

    const gmailAfter = this.formatGmailDate(after);
    const gmailBefore = this.formatGmailDate(before);
    const gmailQuery = `after:${gmailAfter} before:${gmailBefore}`;

    this.logger.log(
      `[CONTEXT-ANALYSIS] Gmail search query for thread IDs: "${gmailQuery}"`,
    );

    // Query Gmail for threads (just IDs, no full data)
    let allThreadIds: string[] = [];
    let nextPageToken: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 10;

    try {
      do {
        const response = await gmail.users.threads.list({
          userId: "me",
          maxResults: 400,
          q: gmailQuery,
          pageToken: nextPageToken,
        });

        const threads = response.data.threads || [];
        allThreadIds.push(
          ...threads.map((thread: { id: string }) => thread.id),
        );
        const { nextPageToken: newNextPageToken } = response.data;
        nextPageToken = newNextPageToken || undefined;
        pageCount++;

        if (pageCount >= maxPages) {
          this.logger.log(
            `[CONTEXT-ANALYSIS] Reached max pages (${maxPages}), stopping pagination`,
          );
          break;
        }
      } while (nextPageToken && allThreadIds.length < limit);
    } catch (error) {
      // Log detailed error info for Gmail API errors
      const errorDetails = getGaxiosErrorDetails(error);
      const formattedError = formatGaxiosError(error);
      this.logger.error(
        `[CONTEXT-ANALYSIS] Gmail API error in getThreadIdsFromGmail: ${formattedError}`,
      );
      this.logger.error(
        `[CONTEXT-ANALYSIS] Gmail API error details: ${JSON.stringify(errorDetails)}`,
      );
      // Re-throw with more context
      throw new Error(`Gmail API error fetching thread IDs: ${formattedError}`);
    }

    // Limit to requested number of threads
    allThreadIds = allThreadIds.slice(0, limit);

    this.logger.log(
      `[CONTEXT-ANALYSIS] Gmail returned ${allThreadIds.length} thread IDs`,
    );

    return allThreadIds;
  }

  /**
   * Get sent thread IDs (no date filter, most recent first)
   * Returns thread IDs for user-initiated sent threads
   * Works with Gmail, Office365, and Zoho
   */
  async getSentThreadIds(
    userId: string,
    limit: number = 100,
  ): Promise<string[]> {
    const provider = await this.getProviderForUser(userId);
    const providerType = this.getProviderTypeName(provider);

    // For Gmail, use the Gmail API directly
    if (providerType === "Gmail") {
      const user = await this.usersService.findOne(userId);
      if (
        !user?.googleCalendarAccessToken ||
        !user?.googleCalendarRefreshToken
      ) {
        throw new Error("Gmail access token missing - please log in again");
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

      // Query for sent threads (no date filter, sorted by most recent)
      const sentGmailQuery = "in:sent";

      this.logger.log(
        `[CONTEXT-ANALYSIS] Gmail sent threads query (no date filter): "${sentGmailQuery}"`,
      );

      // Query Gmail for sent threads (just IDs, no full data)
      let allSentThreadIds: string[] = [];
      let sentNextPageToken: string | undefined = undefined;
      let sentPageCount = 0;
      const maxPages = 10;

      try {
        do {
          const sentResponse = await gmail.users.threads.list({
            userId: "me",
            maxResults: 100,
            q: sentGmailQuery,
            pageToken: sentNextPageToken,
          });

          const threads = sentResponse.data.threads || [];
          allSentThreadIds.push(
            ...threads.map((thread: { id: string }) => thread.id),
          );
          sentNextPageToken = sentResponse.data.nextPageToken;
          sentPageCount++;

          this.logger.log(
            `[CONTEXT-ANALYSIS] Gmail sent threads page ${sentPageCount}: found ${threads.length} threads (total so far: ${allSentThreadIds.length})`,
          );

          // Stop when we have enough threads
          if (allSentThreadIds.length >= limit) break;
          if (sentPageCount >= maxPages) break; // Max 10 pages
        } while (sentNextPageToken && allSentThreadIds.length < limit);
      } catch (error) {
        // Log detailed error info for Gmail API errors
        const errorDetails = getGaxiosErrorDetails(error);
        const formattedError = formatGaxiosError(error);
        this.logger.error(
          `[CONTEXT-ANALYSIS] Gmail API error in getSentThreadIds: ${formattedError}`,
        );
        this.logger.error(
          `[CONTEXT-ANALYSIS] Gmail API error details: ${JSON.stringify(errorDetails)}`,
        );
        // Re-throw with more context
        throw new Error(
          `Gmail API error fetching sent thread IDs: ${formattedError}`,
        );
      }

      // Limit to requested number of sent threads
      allSentThreadIds = allSentThreadIds.slice(0, limit);

      this.logger.log(
        `[CONTEXT-ANALYSIS] Gmail returned ${allSentThreadIds.length} sent thread IDs (most recent)`,
      );

      return allSentThreadIds;
    }

    // For Office365 and Zoho, use searchEmails and extract thread IDs
    // Note: These providers may not support thread-based queries, so we'll use message-based approach
    const userForSentThreads = await this.usersService.findOne(userId);
    const userEmailForSentThreads = userForSentThreads?.email
      ? userForSentThreads.email.toLowerCase()
      : null;

    if (!userEmailForSentThreads) {
      this.logger.warn(
        `[CONTEXT-ANALYSIS] Cannot fetch sent threads - user email not found for ${providerType}`,
      );
      return [];
    }

    try {
      // Use searchEmails to find sent messages (no date filter)
      const sentMessages = await provider.searchEmails(
        userId,
        `from:${userEmailForSentThreads}`, // Search for emails from user (sent emails)
        limit * 2, // Get more messages to ensure we have enough threads
      );

      // Extract thread IDs from sent messages
      const threadIds = new Set<string>();
      sentMessages.forEach((msg: RawEmailMessage) => {
        if (msg.threadId) {
          threadIds.add(msg.threadId);
        }
      });

      const sentThreadIds = Array.from(threadIds).slice(0, limit);

      this.logger.log(
        `[CONTEXT-ANALYSIS] ${providerType} returned ${sentThreadIds.length} sent thread IDs (most recent) from ${sentMessages.length} messages`,
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
   * Fetch full thread data for specific thread IDs
   */
  async fetchThreadsByIds(
    userId: string,
    threadIds: string[],
  ): Promise<ThreadData[]> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken || !user?.googleCalendarRefreshToken) {
      throw new Error("Gmail access token missing - please log in again");
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

    const threadsInRange: ThreadData[] = [];
    const BATCH_SIZE = 50; // Fetch 50 threads at a time

    for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
      const batch = threadIds.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (threadId) => {
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

          // Convert Gmail thread to ThreadData
          const threadEmails: ThreadEmail[] = messages.map(
            (msg: gmail_v1.Schema$Message) => {
              const { payload } = msg;
              const headers = payload?.headers || [];
              const getHeader = (name: string) =>
                headers.find(
                  (h) => h.name?.toLowerCase() === name.toLowerCase(),
                )?.value || "";

              const from = getHeader("From");
              const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/) || [
                null,
                from,
                from,
              ];
              const fromName = fromMatch[1]?.trim() || "";
              const fromEmail = fromMatch[2]?.trim() || from;

              // Extract body
              let body = "";
              let htmlBody = "";
              if (payload?.body?.data) {
                body = Buffer.from(payload.body.data, "base64").toString(
                  "utf-8",
                );
              } else if (payload?.parts) {
                for (const part of payload.parts) {
                  if (part.mimeType === "text/plain" && part.body?.data) {
                    body = Buffer.from(part.body.data, "base64").toString(
                      "utf-8",
                    );
                  } else if (part.mimeType === "text/html" && part.body?.data) {
                    htmlBody = Buffer.from(part.body.data, "base64").toString(
                      "utf-8",
                    );
                  }
                }
              }

              const labelIds = msg.labelIds || [];
              // isRead = true if the UNREAD label is NOT present
              // (Fixed: previously required INBOX label, but archived emails would show as unread)
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
            },
          );

          // Sort by receivedAt
          threadEmails.sort(
            (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime(),
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
      });

      const batchResults = await Promise.all(batchPromises);
      threadsInRange.push(
        ...(batchResults.filter((t) => t !== null) as ThreadData[]),
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
    limit: number = 400,
    onProgress?: (progress: {
      stage: "searching" | "fetching";
      progress: number; // 0-10 (out of 100 total)
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
   * Fetch threads from Gmail using the thread API (Gmail-specific)
   * @param onProgress Optional callback for progress updates and findings
   */
  private async fetchGmailThreads(
    userId: string,
    after: Date,
    before: Date,
    limit: number,
    onProgress?: (progress: {
      stage: "searching" | "fetching";
      progress: number; // 0-10 (out of 100 total)
      threadsFound?: number;
      threadsFetched?: number;
      totalToFetch?: number;
      findings?: string[];
    }) => Promise<void>,
  ): Promise<ThreadData[]> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken || !user?.googleCalendarRefreshToken) {
      throw new Error("Gmail access token missing - please log in again");
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

    const gmailAfter = this.formatGmailDate(after);
    const gmailBefore = this.formatGmailDate(before);
    const gmailQuery = `after:${gmailAfter} before:${gmailBefore}`;

    this.logger.log(`[CONTEXT-ANALYSIS] Gmail search query: "${gmailQuery}"`);

    // Query Gmail for threads
    let allThreadIds: string[] = [];
    let nextPageToken: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 10;

    // Update progress: searching stage (0-3%)
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
      allThreadIds.push(...threads.map((thread: { id: string }) => thread.id));
      const { nextPageToken: newNextPageToken } = response.data;
      nextPageToken = newNextPageToken || undefined;
      pageCount++;

      this.logger.log(
        `[CONTEXT-ANALYSIS] Gmail page ${pageCount}: found ${threads.length} threads (total so far: ${allThreadIds.length})`,
      );

      // Update progress during search
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

    // Limit to requested number of threads
    allThreadIds = allThreadIds.slice(0, limit);

    this.logger.log(
      `[CONTEXT-ANALYSIS] Gmail returned ${allThreadIds.length} thread IDs total`,
    );

    // Fetch full thread details from Gmail in parallel batches
    const threadsInRange: ThreadData[] = [];
    const findings: string[] = [];
    const uniqueSenders = new Set<string>();
    const interestingSubjects: string[] = [];

    this.logger.log(
      `[CONTEXT-ANALYSIS] Fetching full details for ${allThreadIds.length} threads from Gmail in parallel batches...`,
    );

    // Update progress: starting fetch stage (3%)
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

    // Fetch threads in parallel batches of 50
    const FETCH_BATCH_SIZE = 50;
    const fetchThread = async (
      threadId: string,
    ): Promise<ThreadData | null> => {
      try {
        const threadResponse = await gmail.users.threads.get({
          userId: "me",
          id: threadId,
          format: "full",
        });

        const thread = threadResponse.data;
        const messages = thread.messages || [];

        if (messages.length === 0) return null;

        // Get thread-level info
        const lastMessage = messages[messages.length - 1];
        const labelIds = lastMessage.labelIds || [];
        const isArchived = !labelIds.includes(GMAIL_LABELS.INBOX);
        const starCount = labelIds.includes(GMAIL_LABELS.STARRED) ? 3 : 0;
        const updatedAt = new Date(parseInt(lastMessage.internalDate || "0"));

        // Parse emails from thread using Gmail API message type
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

            // Extract body
            let body = "";
            let htmlBody = "";
            const extractBody = (part: {
              // eslint-disable-next-line id-denylist
              body?: { data?: string };
              mimeType?: string;
              parts?: Array<{
                // eslint-disable-next-line id-denylist
                body?: { data?: string };
                mimeType?: string;
                parts?: unknown[];
              }>;
            }) => {
              if (part.body?.data) {
                const text = Buffer.from(part.body.data, "base64").toString(
                  "utf-8",
                );
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
            if (message.payload) {
              extractBody(message.payload);
            }

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

        // Collect interesting findings
        const firstEmail = threadEmails[0];
        if (firstEmail) {
          const sender = firstEmail.fromName || firstEmail.from;
          if (!uniqueSenders.has(sender)) {
            uniqueSenders.add(sender);
            if (uniqueSenders.size <= 5) {
              // Track first 5 unique senders
              const senderDisplay = firstEmail.fromName
                ? `${firstEmail.fromName}`
                : firstEmail.from.split("@")[0];
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
    };

    // Process in parallel batches
    const totalBatchesToFetch = Math.ceil(
      allThreadIds.length / FETCH_BATCH_SIZE,
    );
    for (let i = 0; i < allThreadIds.length; i += FETCH_BATCH_SIZE) {
      const batch = allThreadIds.slice(i, i + FETCH_BATCH_SIZE);
      const batchNum = Math.floor(i / FETCH_BATCH_SIZE) + 1;

      this.logger.log(
        `[CONTEXT-ANALYSIS] Fetching batch ${batchNum}/${totalBatchesToFetch} (threads ${i + 1}-${Math.min(i + FETCH_BATCH_SIZE, allThreadIds.length)})...`,
      );

      // Fetch all threads in this batch in parallel
      const batchResults = await Promise.all(
        batch.map((threadId) => fetchThread(threadId)),
      );

      // Filter out null results and add to threadsInRange
      const validThreads = batchResults.filter(
        (thread): thread is ThreadData => thread !== null,
      );
      threadsInRange.push(...validThreads);

      // Update progress during fetching (3-10%)
      if (onProgress) {
        const fetchProgress =
          3 +
          Math.floor((threadsInRange.length / allThreadIds.length) * DAYS.WEEK);
        const currentFindings = [
          `Fetched ${threadsInRange.length}/${allThreadIds.length} threads...`,
          ...interestingSubjects.slice(0, 3), // Show up to 3 interesting subjects
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
    const sentQuery = this.buildSentFolderQuery(provider, after, before);
    this.logger.log(
      `[CONTEXT-ANALYSIS] ${providerType} sent query: "${sentQuery}"`,
    );

    // Search sent emails using the provider's searchEmails method
    const messages = await provider.searchEmails(userId, sentQuery, limit * 2); // Fetch more to account for filtering

    this.logger.log(
      `[CONTEXT-ANALYSIS] ${providerType} returned ${messages.length} sent messages`,
    );

    // Filter by date range (in case provider doesn't fully support date queries)
    const filteredMessages = messages.filter((msg) => {
      const { receivedAt } = msg;
      return receivedAt >= after && receivedAt <= before;
    });

    if (filteredMessages.length < messages.length) {
      this.logger.log(
        `[CONTEXT-ANALYSIS] ${providerType} filtered to ${filteredMessages.length} sent messages in date range (from ${messages.length} total)`,
      );
    }

    // Convert to SentEmailData[]
    // For sent emails, we want one entry per message (not grouped by thread)
    const sentEmails: SentEmailData[] = filteredMessages.map((msg) => ({
      id: msg.messageId,
      body: msg.body,
      htmlBody: msg.htmlBody,
      subject: msg.subject,
      receivedAt: msg.receivedAt,
    }));

    // Limit to requested number
    const limitedSentEmails = sentEmails.slice(0, limit);

    this.logger.log(
      `[CONTEXT-ANALYSIS] Successfully fetched ${limitedSentEmails.length} sent emails from ${providerType}`,
    );

    return limitedSentEmails;
  }

  /**
   * @deprecated Use fetchSentThreadsFromProvider instead
   * Kept for backward compatibility
   */
  async fetchSentThreadsFromGmail(
    userId: string,
    userEmail: string,
    after: Date,
    before: Date,
    limit: number = 100,
  ): Promise<SentEmailData[]> {
    return this.fetchSentThreadsFromProvider(
      userId,
      userEmail,
      after,
      before,
      limit,
    );
  }

  /**
   * Fetch sent threads from Gmail using the thread API (Gmail-specific)
   */
  private async fetchGmailSentThreads(
    userId: string,
    after: Date,
    before: Date,
    limit: number,
  ): Promise<SentEmailData[]> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken || !user?.googleCalendarRefreshToken) {
      throw new Error("Gmail access token missing - please log in again");
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

    const gmailAfter = this.formatGmailDate(after);
    const gmailBefore = this.formatGmailDate(before);
    const sentGmailQuery = `after:${gmailAfter} before:${gmailBefore} in:sent`;

    this.logger.log(
      `[CONTEXT-ANALYSIS] Gmail sent threads query: "${sentGmailQuery}"`,
    );

    // Query Gmail for sent threads
    let allSentThreadIds: string[] = [];
    let sentNextPageToken: string | undefined = undefined;
    let sentPageCount = 0;

    do {
      const sentResponse = await gmail.users.threads.list({
        userId: "me",
        maxResults: 100,
        q: sentGmailQuery,
        pageToken: sentNextPageToken,
      });

      const threads = sentResponse.data.threads || [];
      allSentThreadIds.push(
        ...threads.map((thread: { id: string }) => thread.id),
      );
      sentNextPageToken = sentResponse.data.nextPageToken;
      sentPageCount++;

      this.logger.log(
        `[CONTEXT-ANALYSIS] Gmail sent threads page ${sentPageCount}: found ${threads.length} threads (total so far: ${allSentThreadIds.length})`,
      );

      // Stop when we have enough threads
      if (allSentThreadIds.length >= limit) break;
      if (sentPageCount >= 10) break; // Max 10 pages
    } while (sentNextPageToken && allSentThreadIds.length < limit);

    // Limit to requested number of sent threads
    allSentThreadIds = allSentThreadIds.slice(0, limit);

    this.logger.log(
      `[CONTEXT-ANALYSIS] Gmail returned ${allSentThreadIds.length} sent thread IDs`,
    );

    // Fetch sent email details
    const sentEmailsData: SentEmailData[] = [];

    const fetchSentThread = async (
      threadId: string,
    ): Promise<SentEmailData | null> => {
      try {
        const threadResponse = await gmail.users.threads.get({
          userId: "me",
          id: threadId,
          format: "full",
        });

        const thread = threadResponse.data;
        const messages = thread.messages || [];

        // Extract the user's sent messages from the thread using SENT label only
        const sentMessages = messages.filter((message: any) => {
          const labelIds = message.labelIds || [];
          // Only check for SENT label - most reliable indicator of sent messages
          return labelIds.includes("SENT");
        });

        // Only use sent messages - if no sent messages found, return null
        // (don't use other person's messages)
        if (sentMessages.length === 0) {
          return null;
        }

        // Use the first sent message from each thread
        const messageToUse = sentMessages[0];
        if (!messageToUse) return null;

        const headers = messageToUse.payload?.headers || [];
        const subject =
          headers.find(
            (h: { name: string; value?: string }) => h.name === "Subject",
          )?.value || "(No Subject)";

        // Extract body
        let body = "";
        let htmlBody = "";
        const extractBody = (part: gmail_v1.Schema$MessagePart | undefined) => {
          if (!part) return;
          if (part.body?.data) {
            const text = Buffer.from(part.body.data, "base64").toString(
              "utf-8",
            );
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
        extractBody(messageToUse.payload);

        const receivedAt = new Date(parseInt(messageToUse.internalDate || "0"));

        return {
          id: messageToUse.id || threadId,
          body,
          htmlBody: htmlBody || undefined,
          subject,
          receivedAt,
        };
      } catch (error: unknown) {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] Failed to fetch sent thread ${threadId}: ${getErrorMessage(error)}`,
        );
        return null;
      }
    };

    // Fetch sent threads in parallel batches of 50
    const SENT_FETCH_BATCH_SIZE = 50;
    for (let i = 0; i < allSentThreadIds.length; i += SENT_FETCH_BATCH_SIZE) {
      const batch = allSentThreadIds.slice(i, i + SENT_FETCH_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((threadId) => fetchSentThread(threadId)),
      );
      const validMessages = batchResults.filter(
        (message): message is SentEmailData => message !== null,
      );
      sentEmailsData.push(...validMessages);
    }

    this.logger.log(
      `[CONTEXT-ANALYSIS] Successfully fetched ${sentEmailsData.length} sent emails from ${allSentThreadIds.length} sent threads`,
    );

    return sentEmailsData;
  }
}

// Alias for backward compatibility with existing imports
export { ContextEmailDataService as ContextGmailDataService };
