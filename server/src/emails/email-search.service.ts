import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { LLMService } from "../llm/llm.service";
import { searchLogger } from "../utils/search-logger";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailSearchRankingService } from "./email-search-ranking.service";

// Type for emails with search metadata
// Note: We use a type intersection instead of extends to avoid getPriorityScore requirement issues
export type EmailWithMetadata = Email & {
  searchExplanation?: string;
  relevanceScore?: number;
  debugInfo?: Record<string, unknown>;
};

export interface RawSearchEmail {
  receivedAt: Date;
  from?: string;
  fromName?: string;
  subject?: string;
  messageId?: string;
  [key: string]: unknown;
}

export interface QueryTried {
  query: string;
  resultCount: number;
  accountType?: string;
}

export interface ProviderSearchResult {
  rawEmails: RawSearchEmail[];
  successfulQuery: string | null;
  queriesTried: QueryTried[];
}

export interface SearchEmailsOptions {
  maxResults?: number;
  onProgress?: (step: string, message: string) => void;
  calculateDaysSinceLastEmail?: (
    userId: string,
    email: Partial<Email>,
  ) => Promise<number | undefined>;
  accountTypes?: string[];
  skipLlmRanking?: boolean;
  /**
   * When true, skip the LLM-driven query expansion fallback in Phase 1.
   * Used by the initial fast-search path (GET /emails/search?skipLlm=true)
   * to return results within the 2s performance budget.
   * LLM expansion is deferred to Phase 3 (POST /emails/search/expand).
   */
  skipLlmFallback?: boolean;
  /**
   * When true, skip the targeted provider sync step in syncAndFetchMatchedEmails.
   * Use for Phase 1 (fast path) to avoid extra provider latency.
   * Missing emails will be synced in the background.
   */
  skipSync?: boolean;
}

/**
 * Note: Search returns a "no-results" marker object when no results are found.
 * The marker has shape: { id: "no-results", subject: "", from: "", body: "",
 * receivedAt: string, debugInfo: { originalQuery, queriesTried, message } }
 * Cast through `unknown` to EmailWithMetadata for type compatibility.
 */

@Injectable()
export class EmailSearchService {
  private readonly logger = new Logger(EmailSearchService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
    private llmService: LLMService,
    private emailSearchRankingService: EmailSearchRankingService,
  ) {}

  /**
   * Search emails using natural language query
   * Converts query to Gmail syntax, searches, and ranks results using AI
   */
  async searchEmails(
    userId: string,
    query: string,
    options: SearchEmailsOptions = {},
  ): Promise<
    Array<
      Email & {
        searchExplanation?: string;
        relevanceScore?: number;
        debugInfo?: Record<string, unknown>;
      }
    >
  > {
    const {
      maxResults = QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE,
      onProgress,
      calculateDaysSinceLastEmail,
      accountTypes,
      skipLlmRanking,
      skipLlmFallback,
      skipSync,
    } = options;
    const originalQuery = query;
    const searchStartTime = Date.now();
    searchLogger.logSearchStart(userId, originalQuery);

    try {
      const providersToSearch = await this.getFilteredProviders(
        userId,
        accountTypes,
      );
      if (!providersToSearch) {
        return this.handleNoProvider(userId, originalQuery, accountTypes);
      }

      const { rawEmails, successfulQuery, gmailQueries, queriesTried } =
        await this.executeSearchWithFallback(
          userId,
          originalQuery,
          providersToSearch,
          onProgress,
          skipLlmFallback,
        );

      if (rawEmails.length === 0) {
        searchLogger.logSearchComplete(
          userId,
          originalQuery,
          0,
          Date.now() - searchStartTime,
        );
        return this.buildNoResultsMarker(
          originalQuery,
          queriesTried,
          "No emails found matching your search",
        );
      }

      onProgress?.("fetching", "Fetching email details...");
      const { emails: matchedEmails, noResultsReason } =
        await this.syncAndFetchMatchedEmails(
          userId,
          rawEmails,
          onProgress,
          skipSync,
        );

      if (matchedEmails.length === 0) {
        searchLogger.logSearchComplete(
          userId,
          originalQuery,
          0,
          Date.now() - searchStartTime,
        );
        return this.buildNoResultsMarker(
          originalQuery,
          queriesTried,
          noResultsReason ?? "No matching emails found",
        );
      }

      return this.performRankedSearch(
        userId,
        originalQuery,
        query,
        matchedEmails,
        rawEmails,
        {
          maxResults,
          skipLlmRanking,
          calculateDaysSinceLastEmail,
          onProgress,
          successfulQuery,
          gmailQueries,
          queriesTried,
          searchStartTime,
        },
      );
    } catch (error) {
      this.logger.error("Search failed:", error);
      searchLogger.logSearchError(userId, originalQuery, String(error));
      throw error;
    }
  }

  /**
   * Run the provider search with an AI-generated fallback if no direct results.
   * Extracted from searchEmails() as part of issue #939 batch 2.
   */
  /**
   * Handle the case where no providers are available for a search.
   * Returns a response array (always non-null) with a no-results or CI-fallback result.
   */
  private async handleNoProvider(
    userId: string,
    originalQuery: string,
    accountTypes?: string[],
  ): Promise<EmailWithMetadata[]> {
    if (process.env.CI_SEARCH_FALLBACK === "true") {
      this.logger.log(
        `[SEARCH] No provider connected for user ${userId}; using CI local-DB fallback`,
      );
      return this.searchEmailsFromLocalDb(userId, originalQuery) as Promise<
        EmailWithMetadata[]
      >;
    }
    const message = accountTypes?.length
      ? `No matching email accounts found for the selected filters: ${accountTypes.join(", ")}`
      : ERROR_MESSAGES.NO_EMAIL_PROVIDER;
    this.logger.warn(
      accountTypes?.length
        ? `No matching email providers for user ${userId} with filter ${accountTypes.join(", ")}`
        : `No email provider connected for user ${userId}`,
    );
    searchLogger.logSearchError(userId, originalQuery, message);
    return this.buildNoResultsMarker(originalQuery, [], message);
  }

  /** Build the sentinel "no-results" array returned when nothing was found. */
  private buildNoResultsMarker(
    originalQuery: string,
    queriesTried: QueryTried[],
    message: string,
  ): EmailWithMetadata[] {
    return [
      {
        id: "no-results",
        subject: "",
        from: "",
        body: "",
        receivedAt: new Date().toISOString(),
        debugInfo: { originalQuery, queriesTried, message },
      } as unknown as EmailWithMetadata,
    ];
  }

  /**
   * Apply LLM ranking (or skip it) and build the final result array.
   * Extracted from searchEmails() to reduce its statement/line count.
   */
  private async performRankedSearch(
    userId: string,
    originalQuery: string,
    query: string,
    matchedEmails: Email[],
    rawEmails: RawSearchEmail[],
    context: {
      maxResults: number;
      skipLlmRanking?: boolean;
      calculateDaysSinceLastEmail?: SearchEmailsOptions["calculateDaysSinceLastEmail"];
      onProgress?: SearchEmailsOptions["onProgress"];
      successfulQuery: string | null;
      gmailQueries: string[];
      queriesTried: QueryTried[];
      searchStartTime: number;
    },
  ): Promise<EmailWithMetadata[]> {
    const {
      maxResults,
      skipLlmRanking,
      calculateDaysSinceLastEmail,
      onProgress,
      successfulQuery,
      gmailQueries,
      queriesTried,
      searchStartTime,
    } = context;

    if (skipLlmRanking) {
      const rawResults = matchedEmails.slice(
        0,
        maxResults,
      ) as EmailWithMetadata[];
      if (rawResults.length > 0) {
        rawResults[0].debugInfo = {
          originalQuery,
          queriesTried,
          gmailQuery: successfulQuery || gmailQueries[0] || query,
          totalRawEmails: rawEmails.length,
        };
      }
      searchLogger.logSearchComplete(
        userId,
        originalQuery,
        rawResults.length,
        Date.now() - searchStartTime,
      );
      return rawResults;
    }

    onProgress?.("analyzing", "Analyzing email relevance...");
    const { filteredEmails, allScores, now } =
      await this.emailSearchRankingService.rankEmails(
        userId,
        originalQuery,
        matchedEmails,
        maxResults,
        calculateDaysSinceLastEmail,
      );

    onProgress?.("explaining", "Generating explanations...");
    const result = await this.buildSearchResults(
      userId,
      originalQuery,
      query,
      matchedEmails,
      filteredEmails,
      rawEmails,
      allScores,
      now,
      successfulQuery,
      gmailQueries,
      queriesTried,
      maxResults,
    );

    searchLogger.logSearchComplete(
      userId,
      originalQuery,
      result.length,
      Date.now() - searchStartTime,
    );
    return result as EmailWithMetadata[];
  }

  private async executeSearchWithFallback(
    userId: string,
    originalQuery: string,
    providersToSearch: Array<{ type: string }>,
    onProgress?: SearchEmailsOptions["onProgress"],
    skipLlmFallback?: boolean,
  ): Promise<{
    rawEmails: RawSearchEmail[];
    successfulQuery: string | null;
    gmailQueries: string[];
    queriesTried: QueryTried[];
  }> {
    const queriesTried: QueryTried[] = [];
    onProgress?.(
      "searching",
      `Searching for emails across ${providersToSearch.length} account(s)...`,
    );

    const {
      rawEmails: direct,
      successfulQuery: directSQ,
      queriesTried: directQt,
    } = await this.searchAllProviders(
      userId,
      [originalQuery],
      providersToSearch,
    );
    queriesTried.push(...directQt);

    if (direct.length > 0) {
      return {
        rawEmails: direct,
        successfulQuery: directSQ,
        gmailQueries: [originalQuery],
        queriesTried,
      };
    }

    // Phase 1 fast path: skip LLM query expansion and return immediately.
    // LLM-driven expansion is deferred to Phase 3 (POST /emails/search/expand),
    // which the frontend calls asynchronously. This keeps Phase 1 within the
    // 2s performance budget.
    if (skipLlmFallback) {
      this.logger.log(
        `[SEARCH] skipLlmFallback=true — skipping LLM query expansion for Phase 1 (user ${userId})`,
      );
      return {
        rawEmails: [],
        successfulQuery: null,
        gmailQueries: [originalQuery],
        queriesTried,
      };
    }

    onProgress?.("converting", "Crafting alternative search queries...");
    const aiQueries = await this.buildGmailQueriesFromNaturalLanguage(
      userId,
      originalQuery,
    );
    const gmailQueries = [
      originalQuery,
      ...aiQueries.filter((aiQuery) => aiQuery !== originalQuery),
    ];

    onProgress?.(
      "searching",
      `Searching for emails across ${providersToSearch.length} account(s)...`,
    );
    const {
      rawEmails: fallback,
      successfulQuery: fallbackSQ,
      queriesTried: fallbackQt,
    } = await this.searchAllProviders(
      userId,
      gmailQueries.slice(1),
      providersToSearch,
    );
    queriesTried.push(...fallbackQt);

    return {
      rawEmails: fallback,
      successfulQuery: fallbackSQ,
      gmailQueries,
      queriesTried,
    };
  }

  /**
   * Fetch matched emails from DB; if empty, trigger targeted provider sync and re-query.
   * Extracted from searchEmails() as part of issue #939 batch 2.
   */
  private async syncAndFetchMatchedEmails(
    userId: string,
    rawEmails: RawSearchEmail[],
    onProgress?: SearchEmailsOptions["onProgress"],
    skipSync?: boolean,
  ): Promise<{ emails: Email[]; noResultsReason?: string }> {
    const initial = await this.fetchMatchedDbEmails(userId, rawEmails);
    if (initial.length > 0) return { emails: initial };

    // Phase 1 fast path: skip provider sync to stay within performance budget.
    // Missing emails will become available after the next background sync.
    if (skipSync) {
      this.logger.log(
        `[SEARCH] skipSync=true — skipping targeted provider sync for Phase 1 (user ${userId})`,
      );
      return { emails: [] };
    }

    const messageIds = rawEmails
      .map((emailEntry) => emailEntry.messageId as string | undefined)
      .filter((id): id is string => id != null);

    const byProvider = new Map<string, Set<string>>();
    for (const rawEmail of rawEmails) {
      const threadId = rawEmail.threadId as string | undefined;
      const providerType = (rawEmail._providerType as string) || "gmail";
      if (threadId) {
        if (!byProvider.has(providerType))
          byProvider.set(providerType, new Set());
        byProvider.get(providerType)!.add(threadId);
      }
    }

    const MAX_THREADS_TO_SYNC = 10;
    for (const [providerType, threadIdSet] of byProvider.entries()) {
      const provider = await this.emailProviderManager.getProvider(
        userId,
        providerType,
      );
      if (!provider) continue;
      const threadIds = [...threadIdSet].slice(0, MAX_THREADS_TO_SYNC);
      this.logger.log(
        `[SEARCH] Syncing ${threadIds.length} missing threads from ${providerType} for user ${userId}`,
      );
      try {
        onProgress?.(
          "syncing",
          `Syncing ${threadIds.length} email(s) to BearlyMail...`,
        );
        await provider.syncEmails(userId, { threadIds, isContinuation: true });
      } catch (syncError) {
        this.logger.warn(
          `[SEARCH] Targeted sync for ${providerType} failed:`,
          syncError,
        );
      }
    }

    const syncedDbEmails = await this.emailRepository.find({
      where: { userId, messageId: In(messageIds) },
      order: { receivedAt: "DESC" },
    });
    const syncedMap = new Map(
      syncedDbEmails.map((emailItem) => [emailItem.messageId, emailItem]),
    );
    const synced = this.buildOrderedResults(rawEmails, syncedMap);

    if (synced.length === 0) {
      return {
        emails: [],
        noResultsReason:
          "Emails found in your email provider but could not be synced to BearlyMail. They will appear after the next automatic sync.",
      };
    }
    return { emails: synced };
  }

  private buildOrderedResults(
    rawEmails: RawSearchEmail[],
    syncedMap: Map<string | undefined, Email>,
  ): Email[] {
    return rawEmails
      .map((rawEmail) => {
        const messageId = rawEmail.messageId as string | undefined;
        return messageId ? syncedMap.get(messageId) : undefined;
      })
      .filter((email): email is Email => email != null);
  }

  private async getFilteredProviders(
    userId: string,
    accountTypes?: string[],
  ): Promise<Array<{ type: string }> | null> {
    const connectedProviders =
      await this.emailProviderManager.getAllConnectedProviders(userId);
    if (connectedProviders.length === 0) return null;

    if (!accountTypes?.length) return connectedProviders;

    const filtered = connectedProviders.filter((part) =>
      accountTypes.includes(part.type),
    );
    return filtered.length > 0 ? filtered : null;
  }

  private async buildGmailQueriesFromNaturalLanguage(
    userId: string,
    query: string,
  ): Promise<string[]> {
    searchLogger.logQueryVariations(userId, query, [query]);
    try {
      const gmailQuery =
        await this.emailSearchRankingService.convertQueryToGmailSearch(
          userId,
          query,
        );
      const gmailQueries = gmailQuery ? [gmailQuery] : [query];
      searchLogger.logGmailQueries(userId, query, gmailQueries);
      return gmailQueries;
    } catch (error) {
      this.logger.warn(`Failed to convert query "${query}"`, error);
      searchLogger.logGmailQueries(userId, query, [query]);
      return [query];
    }
  }

  private async buildSearchResults(
    userId: string,
    originalQuery: string,
    fallbackQuery: string,
    matchedEmails: Email[],
    filteredEmails: Email[],
    rawEmails: RawSearchEmail[],
    allScores: Map<number, number>,
    now: Date,
    successfulQuery: string | null,
    gmailQueries: string[],
    queriesTried: QueryTried[],
    maxResults: number,
  ): Promise<EmailWithMetadata[]> {
    let explanationsMap = new Map<number, string>();
    if (filteredEmails.length > 0) {
      try {
        const emailsForExplanation = filteredEmails.map((email, idx) => ({
          index: idx,
          from: email.fromName || email.from || "",
          subject: email.subject || "",
          body: email.body || "",
          receivedAt: email.receivedAt
            ? email.receivedAt.toISOString()
            : new Date().toISOString(),
        }));
        explanationsMap =
          await this.llmService.generateSearchRelevanceExplanationsBatch(
            originalQuery,
            emailsForExplanation,
            userId,
          );
      } catch (error) {
        this.logger.warn(
          "Batch explanation generation failed, using fallback:",
          error,
        );
      }
    }

    const emailsWithMetadata: EmailWithMetadata[] = filteredEmails.map(
      (email, idx) => {
        const emailIndex = matchedEmails.indexOf(email);
        const relevanceScore = allScores.get(emailIndex) ?? undefined;
        return {
          ...email,
          searchExplanation:
            explanationsMap.get(idx) ||
            (successfulQuery
              ? `Found using query: "${successfulQuery}"`
              : "Search completed"),
          relevanceScore,
        } as EmailWithMetadata;
      },
    );

    emailsWithMetadata.sort(
      (itemA, itemB) =>
        (itemB.relevanceScore ?? 0) - (itemA.relevanceScore ?? 0),
    );

    const debugInfo = {
      originalQuery,
      gmailQuery: successfulQuery || gmailQueries[0] || fallbackQuery,
      queriesTried,
      totalRawEmails: rawEmails.length,
      maxResultsRequested: maxResults,
      filteredCount: filteredEmails.length,
      allRawEmails: rawEmails.map((rawEmail, index) => {
        const receivedDate = new Date(rawEmail.receivedAt);
        const daysAgo = Math.floor(
          (now.getTime() - receivedDate.getTime()) / MILLISECONDS.DAY,
        );
        return {
          index,
          from: rawEmail.fromName || rawEmail.from,
          subject: rawEmail.subject,
          receivedAt: rawEmail.receivedAt,
          daysAgo,
          aiScore: allScores.get(index) ?? null,
          includedInResults: filteredEmails.some(
            (emailEntry) =>
              (emailEntry as { messageId?: string }).messageId ===
              (rawEmail.messageId as string),
          ),
        };
      }),
    };

    return emailsWithMetadata.map((email, index) => {
      if (index === 0) {
        (email as EmailWithMetadata).debugInfo = debugInfo;
      }
      return email;
    });
  }

  private async fetchMatchedDbEmails(
    userId: string,
    rawEmails: RawSearchEmail[],
  ): Promise<Email[]> {
    const messageIds = rawEmails
      .map((emailEntry) => emailEntry.messageId as string | undefined)
      .filter((id): id is string => id != null);

    if (messageIds.length === 0) {
      return [];
    }

    const dbEmails = await this.emailRepository.find({
      where: { userId, messageId: In(messageIds as string[]) },
      order: { receivedAt: "DESC" },
    });

    const emailMap = new Map(
      dbEmails.map((emailEntry) => [emailEntry.messageId, emailEntry]),
    );
    const matchedEmails: Email[] = [];
    for (const rawEmail of rawEmails) {
      const messageId = rawEmail.messageId as string | undefined;
      if (messageId && emailMap.has(messageId)) {
        matchedEmails.push(emailMap.get(messageId)!);
      }
    }
    return matchedEmails;
  }

  private async searchAllProviders(
    userId: string,
    gmailQueries: string[],
    providersToSearch: Array<{ type: string }>,
  ): Promise<ProviderSearchResult> {
    const rawEmails: RawSearchEmail[] = [];
    const queriesTried: QueryTried[] = [];
    let successfulQuery: string | null = null;
    const initialMaxResults = QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE;

    for (const providerInfo of providersToSearch) {
      const provider = await this.emailProviderManager.getProvider(
        userId,
        providerInfo.type,
      );
      if (!provider) continue;

      for (const gmailQuery of gmailQueries) {
        try {
          const searchResults = await provider.searchEmails(
            userId,
            gmailQuery,
            initialMaxResults,
          );
          queriesTried.push({
            query: gmailQuery,
            resultCount: searchResults.length,
            accountType: providerInfo.type,
          });

          if (searchResults.length > 0) {
            rawEmails.push(...(searchResults as unknown as RawSearchEmail[]));
            successfulQuery = gmailQuery;
            this.logger.log(
              `[SEARCH] Query "${gmailQuery}" on ${providerInfo.type} returned ${searchResults.length} results`,
            );
            break;
          }
        } catch (error) {
          this.logger.warn(
            `Search query "${gmailQuery}" on ${providerInfo.type} failed:`,
            error,
          );
          queriesTried.push({
            query: gmailQuery,
            resultCount: 0,
            accountType: providerInfo.type,
          });
        }
      }
    }

    return { rawEmails, successfulQuery, queriesTried };
  }

  /**
   * Rank and explain a list of emails using AI, given a search query.
   * Used for async LLM refinement after returning initial fast results.
   */
  async rankAndExplainEmails(
    userId: string,
    query: string,
    emails: Email[],
    maxResults: number,
    calculateDaysSinceLastEmail?: (
      userId: string,
      email: Partial<Email>,
    ) => Promise<number | undefined>,
  ): Promise<
    Array<Email & { searchExplanation?: string; relevanceScore?: number }>
  > {
    return this.emailSearchRankingService.rankAndExplainEmails(
      userId,
      query,
      emails,
      maxResults,
      calculateDaysSinceLastEmail,
    );
  }

  async generateAlternativeQueries(
    userId: string,
    originalQuery: string,
  ): Promise<string[]> {
    return this.emailSearchRankingService.generateAlternativeQueries(
      userId,
      originalQuery,
    );
  }

  /**
   * Search for additional emails using alternative queries, excluding already-found email IDs.
   * Returns raw (unranked) results for the caller to optionally rank.
   */
  async searchExpand(
    userId: string,
    originalQuery: string,
    existingEmailIds: Set<string>,
  ): Promise<EmailWithMetadata[]> {
    const alternativeQueries =
      await this.emailSearchRankingService.generateAlternativeQueries(
        userId,
        originalQuery,
      );
    this.logger.log(
      `[SEARCH EXPAND] Trying ${alternativeQueries.length} alternative queries for "${originalQuery}"`,
    );

    const connectedProviders =
      await this.emailProviderManager.getAllConnectedProviders(userId);
    if (connectedProviders.length === 0) {
      return [];
    }

    const newRawEmailIds = new Set<string>();
    const allRawEmails: Array<{
      receivedAt: Date;
      messageId?: string;
      [key: string]: unknown;
    }> = [];

    for (const altQuery of alternativeQueries) {
      let gmailQuery: string;
      try {
        gmailQuery =
          await this.emailSearchRankingService.convertQueryToGmailSearch(
            userId,
            altQuery,
          );
      } catch {
        gmailQuery = altQuery;
      }

      for (const providerInfo of connectedProviders) {
        const provider = await this.emailProviderManager.getProvider(
          userId,
          providerInfo.type,
        );
        if (!provider) continue;

        try {
          const searchResults = await provider.searchEmails(
            userId,
            gmailQuery,
            QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE,
          );
          for (const result of searchResults) {
            const msgId = (result as { messageId?: string }).messageId;
            if (msgId && !newRawEmailIds.has(msgId)) {
              newRawEmailIds.add(msgId);
              allRawEmails.push(
                result as { receivedAt: Date; messageId?: string },
              );
            }
          }
        } catch (error) {
          this.logger.warn(
            `Expand query "${gmailQuery}" on ${providerInfo.type} failed:`,
            error,
          );
        }
      }
    }

    if (allRawEmails.length === 0) {
      return [];
    }

    // Fetch from DB, excluding already-found emails
    const messageIds = allRawEmails
      .map((emailEntry) => emailEntry.messageId as string | undefined)
      .filter((id): id is string => !!id);

    const dbEmails = await this.emailRepository.find({
      where: { userId, messageId: In(messageIds) },
      order: { receivedAt: "DESC" },
    });

    // Filter out emails already shown
    return dbEmails
      .filter((emailEntry) => !existingEmailIds.has(emailEntry.id))
      .slice(0, QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE) as EmailWithMetadata[];
  }

  /**
   * CI / local-DB search fallback.
   *
   * Used when no email provider is connected (e.g. in CI e2e tests against
   * seeded data).  Because all email fields are AES-encrypted in Postgres we
   * can't do a DB-level LIKE query — instead we load all of the user's emails,
   * let TypeORM decrypt them via the column transformers, and then filter
   * in-memory.
   *
   * This is intentionally simple and only suitable for small datasets (CI
   * seed data).  Do not use in production paths.
   */
  private async searchEmailsFromLocalDb(
    userId: string,
    query: string,
  ): Promise<EmailWithMetadata[]> {
    const allEmails = await this.emailRepository.find({
      where: { userId },
      order: { receivedAt: "DESC" },
      take: QUERY_LIMITS.CI_LOCAL_DB_SEARCH_MAX,
    });

    const lowerQuery = query.toLowerCase();
    const queriesTried: QueryTried[] = [
      { query: `local-db:${query}`, resultCount: 0, accountType: "local-db" },
    ];

    const matched = allEmails.filter((email) => {
      const subject = (email.subject || "").toLowerCase();
      const from = (email.from || "").toLowerCase();
      const fromName = (email.fromName || "").toLowerCase();
      const body = (email.body || "").toLowerCase();
      return (
        subject.includes(lowerQuery) ||
        from.includes(lowerQuery) ||
        fromName.includes(lowerQuery) ||
        body.includes(lowerQuery)
      );
    });

    queriesTried[0].resultCount = matched.length;

    if (matched.length === 0) {
      return this.buildNoResultsMarker(
        query,
        queriesTried,
        "No emails found matching your search",
      );
    }

    return matched.map((email, idx) => {
      const result = {
        ...email,
        searchExplanation: `Found via local DB search for "${query}"`,
        relevanceScore: Math.max(
          QUERY_LIMITS.CI_LOCAL_DB_MIN_SCORE,
          QUERY_LIMITS.CI_LOCAL_DB_BASE_SCORE -
            idx * QUERY_LIMITS.CI_LOCAL_DB_SCORE_STEP,
        ),
        debugInfo:
          idx === 0
            ? {
                originalQuery: query,
                queriesTried,
                gmailQuery: `local-db:${query}`,
                totalRawEmails: matched.length,
              }
            : undefined,
      } as unknown as EmailWithMetadata;
      return result;
    });
  }
}
