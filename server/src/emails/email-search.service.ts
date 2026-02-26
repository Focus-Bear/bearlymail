import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { Email } from "../database/entities/email.entity";
import { EmailProviderManager } from "./email-provider-manager.service";
import { LLMService } from "../llm/llm.service";
import { searchLogger } from "../utils/search-logger";
import { QUERY_LIMITS } from "../constants/query-limits";
import {
  PRIORITY_BOOSTS,
  PRIORITY_SCORES,
} from "../constants/priority-constants";
import { DAYS } from "../constants/time-constants";
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
    } = options;
    const originalQuery = query;
    const queriesTried: QueryTried[] = [];
    const searchStartTime = Date.now();

    // Log search start
    searchLogger.logSearchStart(userId, originalQuery);

    try {
      // Get and filter connected providers
      const providersToSearch = await this.getFilteredProviders(
        userId,
        accountTypes,
      );
      if (!providersToSearch) {
        const message = accountTypes?.length
          ? `No matching email accounts found for the selected filters: ${accountTypes?.join(", ")}`
          : "No email provider connected";
        const logMsg = accountTypes?.length
          ? `No matching email providers for user ${userId} with filter ${accountTypes?.join(", ")}`
          : `No email provider connected for user ${userId}`;
        this.logger.warn(logMsg);
        searchLogger.logSearchError(userId, originalQuery, message);
        return [
          {
            id: "no-results",
            subject: "",
            from: "",
            body: "",
            receivedAt: new Date().toISOString(),
            debugInfo: { originalQuery, queriesTried: [], message },
          } as unknown as EmailWithMetadata,
        ];
      }

      // Step 1: Convert query to Gmail search syntax
      onProgress?.("converting", "Crafting search query for Gmail...");
      const gmailQueries = await this.buildGmailQueriesFromNaturalLanguage(
        userId,
        originalQuery,
      );

      // Step 2: Search across all selected providers
      onProgress?.(
        "searching",
        `Searching for emails across ${providersToSearch.length} account(s)...`,
      );

      const providerSearchResult = await this.searchAllProviders(
        userId,
        gmailQueries,
        providersToSearch,
      );
      const { rawEmails, successfulQuery } = providerSearchResult;
      queriesTried.push(...providerSearchResult.queriesTried);

      if (rawEmails.length === 0) {
        searchLogger.logSearchComplete(
          userId,
          originalQuery,
          0,
          Date.now() - searchStartTime,
        );
        // Return a special "no-results" marker with debug info including queries tried
        return [
          {
            id: "no-results",
            subject: "",
            from: "",
            body: "",
            receivedAt: new Date().toISOString(),
            debugInfo: {
              originalQuery,
              queriesTried,
              message: "No emails found matching your search",
            },
          } as unknown as EmailWithMetadata,
        ];
      }

      // Step 3: Fetch full email data from our database
      onProgress?.("fetching", "Fetching email details...");
      const matchedEmails = await this.fetchMatchedDbEmails(userId, rawEmails);
      const messageIds = rawEmails
        .map((e) => e.messageId as string | undefined)
        .filter((id): id is string => id !== null && id !== undefined);

      if (matchedEmails.length === 0) {
        // Emails were found in the provider but aren't in our DB yet.
        // Trigger a targeted sync for those specific threads, then re-query.
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
            await provider.syncEmails(userId, {
              threadIds,
              isContinuation: true,
            });
          } catch (syncError) {
            this.logger.warn(
              `[SEARCH] Targeted sync for ${providerType} failed:`,
              syncError,
            );
          }
        }

        // Re-query the database after the sync
        const syncedDbEmails = await this.emailRepository.find({
          where: {
            userId,
            messageId: In(messageIds as string[]),
          },
          order: { receivedAt: "DESC" },
        });
        const syncedEmailMap = new Map(
          syncedDbEmails.map((e) => [e.messageId, e]),
        );
        for (const rawEmail of rawEmails) {
          const messageId = rawEmail.messageId as string | undefined;
          if (messageId && syncedEmailMap.has(messageId)) {
            matchedEmails.push(syncedEmailMap.get(messageId)!);
          }
        }

        if (matchedEmails.length === 0) {
          searchLogger.logSearchComplete(
            userId,
            originalQuery,
            0,
            Date.now() - searchStartTime,
          );
          // Return a special "no-results" marker with debug info including queries tried
          return [
            {
              id: "no-results",
              subject: "",
              from: "",
              body: "",
              receivedAt: new Date().toISOString(),
              debugInfo: {
                originalQuery,
                queriesTried,
                message:
                  "Emails found in your email provider but could not be synced to BearlyMail. They will appear after the next automatic sync.",
              },
            } as unknown as EmailWithMetadata,
          ];
        }
      }

      // If skipLlmRanking is set, return raw results immediately without LLM processing
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

      // Step 4: Rank results using AI
      onProgress?.("analyzing", "Analyzing email relevance...");
      const { filteredEmails, allScores, now } = await this.rankAndFilterEmails(
        userId,
        originalQuery,
        matchedEmails,
        maxResults,
        calculateDaysSinceLastEmail,
      );

      // Generate explanations and build results
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

      const searchDuration = Date.now() - searchStartTime;
      searchLogger.logSearchComplete(
        userId,
        originalQuery,
        result.length,
        searchDuration,
      );

      return result as Array<
        Email & {
          searchExplanation?: string;
          relevanceScore?: number;
          debugInfo?: Record<string, unknown>;
        }
      >;
    } catch (error) {
      this.logger.error("Search failed:", error);
      searchLogger.logSearchError(userId, originalQuery, String(error));
      throw error;
    }
  }

  private async getFilteredProviders(
    userId: string,
    accountTypes?: string[],
  ): Promise<Array<{ type: string }> | null> {
    const connectedProviders =
      await this.emailProviderManager.getAllConnectedProviders(userId);
    if (connectedProviders.length === 0) return null;

    if (!accountTypes?.length) return connectedProviders;

    const filtered = connectedProviders.filter((p) =>
      accountTypes.includes(p.type),
    );
    return filtered.length > 0 ? filtered : null;
  }

  private async buildGmailQueriesFromNaturalLanguage(
    userId: string,
    query: string,
  ): Promise<string[]> {
    const naturalVariations = [query];
    this.logger.log(
      `[SEARCH] Generated ${naturalVariations.length} variations: ${naturalVariations.join(", ")}`,
    );
    searchLogger.logQueryVariations(userId, query, naturalVariations);

    const gmailQueries: string[] = [];
    for (const naturalVar of naturalVariations) {
      try {
        const gmailQuery = await this.convertQueryToGmailSearch(
          userId,
          naturalVar,
        );
        if (gmailQuery && !gmailQueries.includes(gmailQuery)) {
          gmailQueries.push(gmailQuery);
        }
      } catch (error) {
        this.logger.warn(`Failed to convert variation "${naturalVar}"`, error);
      }
    }

    if (gmailQueries.length === 0) {
      const gmailQuery = await this.convertQueryToGmailSearch(userId, query);
      gmailQueries.push(gmailQuery);
    }

    this.logger.log(
      `[SEARCH] Will try ${gmailQueries.length} Gmail queries: ${gmailQueries.join(", ")}`,
    );
    searchLogger.logGmailQueries(userId, query, gmailQueries);
    return gmailQueries;
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
      (a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0),
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
          (now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        return {
          index,
          from: rawEmail.fromName || rawEmail.from,
          subject: rawEmail.subject,
          receivedAt: rawEmail.receivedAt,
          daysAgo,
          aiScore: allScores.get(index) ?? null,
          includedInResults: filteredEmails.some(
            (e) =>
              (e as { messageId?: string }).messageId ===
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

  private async rankAndFilterEmails(
    userId: string,
    originalQuery: string,
    matchedEmails: Email[],
    maxResults: number,
    calculateDaysSinceLastEmail?: SearchEmailsOptions["calculateDaysSinceLastEmail"],
  ): Promise<{
    filteredEmails: Email[];
    allScores: Map<number, number>;
    now: Date;
  }> {
    const now = new Date();
    const allScores: Map<number, number> = new Map();

    if (matchedEmails.length === 0) {
      return {
        filteredEmails: matchedEmails.slice(0, maxResults),
        allScores,
        now,
      };
    }

    const emailSummaries = await Promise.all(
      matchedEmails.map(async (email) => {
        const receivedDate = new Date(email.receivedAt);
        const daysAgo = Math.floor(
          (now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        const daysSince = calculateDaysSinceLastEmail
          ? await calculateDaysSinceLastEmail(userId, email)
          : undefined;
        return {
          index: matchedEmails.indexOf(email),
          from: email.fromName || email.from || "",
          subject: email.subject || "",
          snippet: email.body?.substring(0, 200) || "",
          daysAgo,
          isRecent: daysAgo <= DAYS.WEEK,
          daysSinceLastEmail: daysSince,
        };
      }),
    );

    const mostRecentDays = calculateDaysSinceLastEmail
      ? await calculateDaysSinceLastEmail(userId, matchedEmails[0])
      : undefined;

    let filteredEmails = matchedEmails;

    try {
      searchLogger.logAIScoringStart(
        userId,
        originalQuery,
        matchedEmails.length,
      );
      const isTimeSensitive = this.isTimeSensitiveQuery(originalQuery);
      const rankingPrompt = this.buildRankingPrompt(
        originalQuery,
        emailSummaries,
        mostRecentDays,
        isTimeSensitive,
      );

      const rankingResponse = await this.llmService.generateText(
        {
          prompt: rankingPrompt,
          systemPrompt:
            "You are a helpful email search assistant. Return only valid JSON arrays.",
          temperature: QUERY_LIMITS.LLM_TEMPERATURE,
          maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_LARGE,
        },
        undefined,
        userId,
      );

      searchLogger.logAIScoringComplete(
        userId,
        originalQuery,
        matchedEmails.length,
        filteredEmails.length,
        matchedEmails.length - filteredEmails.length,
      );

      try {
        const jsonMatch = rankingResponse.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          const rankings: Array<{ index: number; relevanceScore: number }> =
            JSON.parse(jsonMatch[0]);
          if (Array.isArray(rankings)) {
            rankings.forEach((rank) => {
              allScores.set(rank.index, rank.relevanceScore);
            });
            filteredEmails = matchedEmails.filter(
              (_email, index) =>
                (allScores.get(index) ?? 0) >=
                PRIORITY_BOOSTS.RELEVANCE_THRESHOLD,
            );
            filteredEmails.sort((a, b) => {
              const scoreA = allScores.get(matchedEmails.indexOf(a)) ?? 0;
              const scoreB = allScores.get(matchedEmails.indexOf(b)) ?? 0;
              return scoreB - scoreA;
            });
            filteredEmails = filteredEmails.slice(0, maxResults);
          }
        }
      } catch (parseError) {
        this.logger.warn(
          "Failed to parse AI ranking response, using all results:",
          parseError,
        );
        filteredEmails = matchedEmails.slice(0, maxResults);
      }
    } catch (error) {
      this.logger.error("AI ranking failed, using all results:", error);
      filteredEmails = matchedEmails.slice(0, maxResults);
    }

    return { filteredEmails, allScores, now };
  }

  private buildRankingPrompt(
    originalQuery: string,
    emailSummaries: Array<{
      index: number;
      from: string;
      subject: string;
      snippet: string;
      daysAgo: number;
      isRecent: boolean;
      daysSinceLastEmail?: number;
    }>,
    daysSinceLastEmail: number | undefined,
    isTimeSensitive: boolean,
  ): string {
    const recency30DPenalty = isTimeSensitive
      ? PRIORITY_BOOSTS.RECENCY_30D_PENALTY *
        QUERY_LIMITS.SEARCH_RELEVANCE_MULTIPLIER
      : PRIORITY_BOOSTS.RECENCY_30D_PENALTY;
    const recency60DPenalty = isTimeSensitive
      ? PRIORITY_BOOSTS.RECENCY_60D_PENALTY *
        QUERY_LIMITS.SEARCH_RELEVANCE_MULTIPLIER
      : PRIORITY_BOOSTS.RECENCY_60D_PENALTY;
    const timeSensitivityNote = isTimeSensitive
      ? "\n\n⚠️ TIME-SENSITIVE QUERY DETECTED: OLDER emails should be penalized MORE HEAVILY. Emails older than 30 days should receive significantly lower scores unless extremely relevant."
      : "";

    const emailLines = emailSummaries
      .map((e, index) => {
        let recencyLabel = "";
        if (e.daysAgo === 0) recencyLabel = " (TODAY!)";
        else if (e.daysAgo <= 1) recencyLabel = " (LAST 24 HOURS!)";
        else if (e.isRecent) recencyLabel = " (RECENT)";
        return `${index}. From: ${e.from}, Subject: ${e.subject}, Received: ${e.daysAgo} days ago${recencyLabel}, Preview: ${e.snippet.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LONG)}...`;
      })
      .join("\n");

    return `You are an email search assistant. Rank these ${emailSummaries.length} emails by relevance to the search query: "${originalQuery}"

IMPORTANT CONTEXT:
- The most recent email in this set was received ${daysSinceLastEmail} days ago
- Prioritize RECENT emails heavily${timeSensitivityNote}

CRITICAL RELEVANCE RULES:
1. If the query asks about a specific person, emails MUST be from that person or mention them prominently
2. Emails that don't mention the person should get a score of 0-20
3. Emails from automated services that don't mention the person should get very low scores (0-15)
4. Only emails that directly relate to the query should score above ${PRIORITY_SCORES.MEDIUM_THRESHOLD}

CRITICAL RECENCY RULES:
- TODAY: +${PRIORITY_BOOSTS.RECENCY_TODAY} bonus
- Last 24 hours: +${PRIORITY_BOOSTS.RECENCY_24H} bonus
- Last ${DAYS.WEEK} days: +${PRIORITY_BOOSTS.RECENCY_7D} bonus
- ${DAYS.WEEK + 1}-${DAYS.MONTH} days: +${PRIORITY_BOOSTS.RECENCY_30D} bonus
- Older than ${DAYS.MONTH} days: ${recency30DPenalty} penalty
- Older than 60 days: ${recency60DPenalty} penalty

STRICT FILTERING: Only include emails with final score >= ${PRIORITY_BOOSTS.RELEVANCE_THRESHOLD}.

Return a JSON array: [{"index": 2, "relevanceScore": 95}, ...]

Emails:
${emailLines}

Return ONLY a JSON array of objects.`;
  }

  private async fetchMatchedDbEmails(
    userId: string,
    rawEmails: RawSearchEmail[],
  ): Promise<Email[]> {
    const messageIds = rawEmails
      .map((e) => e.messageId as string | undefined)
      .filter((id): id is string => id !== null && id !== undefined);

    if (messageIds.length === 0) {
      return [];
    }

    const dbEmails = await this.emailRepository.find({
      where: { userId, messageId: In(messageIds as string[]) },
      order: { receivedAt: "DESC" },
    });

    const emailMap = new Map(dbEmails.map((e) => [e.messageId, e]));
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
        gmailQuery = await this.convertQueryToGmailSearch(userId, altQuery);
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
      .map((e) => e.messageId as string | undefined)
      .filter((id): id is string => !!id);

    const dbEmails = await this.emailRepository.find({
      where: { userId, messageId: In(messageIds) },
      order: { receivedAt: "DESC" },
    });

    // Filter out emails already shown
    return dbEmails
      .filter((e) => !existingEmailIds.has(e.id))
      .slice(0, QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE) as EmailWithMetadata[];
  }

  /**
   * Convert natural language query to Gmail search syntax using AI
   */
  private async convertQueryToGmailSearch(
    userId: string,
    query: string,
  ): Promise<string> {
    // Check if query already looks like Gmail syntax (contains operators like from:, to:, subject:, etc.)
    const gmailOperators = [
      "from:",
      "to:",
      "subject:",
      "has:",
      "in:",
      "is:",
      "before:",
      "after:",
      "older:",
      "newer:",
    ];

    const hasGmailOperator = gmailOperators.some((op) =>
      query.toLowerCase().includes(op),
    );

    if (hasGmailOperator) {
      // Query already contains Gmail operators, return as-is
      return query;
    }

    // Use AI to convert natural language to Gmail search syntax
    const conversionPrompt = `Convert this natural language email search query to Gmail search syntax: "${query}"

Gmail search syntax rules:
- Use "from:" for sender (e.g., "from:john@example.com")
- Use "subject:" for subject line (e.g., "subject:meeting")
- Use "has:" for attachments (e.g., "has:attachment")
- Use "in:" for labels/folders (e.g., "in:inbox")
- Use "is:" for flags (e.g., "is:read", "is:unread", "is:starred")
- Use "before:" and "after:" for dates (e.g., "after:2024/1/1")
- Combine terms with spaces (AND) or use OR for alternatives
- Use quotes for exact phrases (e.g., "subject:\"team meeting\"")

Return ONLY the Gmail search query, nothing else.`;

    try {
      const response = await this.llmService.generateText(
        {
          prompt: conversionPrompt,
          systemPrompt:
            "You are a helpful assistant that converts natural language to Gmail search syntax. Return only the search query.",
          temperature: 0.3,
          maxTokens: 200,
        },
        undefined,
        userId,
      );

      // Extract the query (remove any markdown formatting or extra text)
      const cleaned = response
        .trim()
        .replace(/^```[\w]*\n?/g, "")
        .replace(/\n?```$/g, "")
        .trim();

      // If the response looks valid, use it; otherwise fall back to simple keyword search
      if (cleaned.length > 0 && cleaned.length < 500) {
        return cleaned;
      }
    } catch (error) {
      this.logger.warn("Failed to convert query using AI:", error);
    }

    // Fallback: simple keyword-based search
    // Split query into words and search in subject and body
    const words = query
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => `"${w}"`)
      .join(" OR ");
    return `subject:(${words}) OR ${words}`;
  }

  private isTimeSensitiveQuery(query: string): boolean {
    const lowerQuery = query.toLowerCase();

    const timeSensitivePatterns = [
      /\b(is|are|will|coming|going|attending|joining|participating)\b/i,
      /\b(meeting|appointment|call|conference|event|gathering|session)\b/i,
      /\b(when|what time|what day|which day|tomorrow|today|this week|next week)\b/i,
      /\b(status|confirmed|cancel|reschedule|postpone)\b/i,
      /\b(plan|schedule|arrange|organize|set up)\b/i,
    ];

    const hasQuestionWord = /\b(is|are|will|when|what|where|who|how)\b/i.test(
      lowerQuery,
    );
    const hasTimeSensitivePattern = timeSensitivePatterns.some((pattern) =>
      pattern.test(lowerQuery),
    );

    const isDirectQuestion =
      /\b(is|are|will|when|what|where|who|how)\b/i.test(
        lowerQuery.trim().split(/\s+/)[0],
      ) || lowerQuery.includes("?");

    return (
      (hasQuestionWord && hasTimeSensitivePattern) ||
      (isDirectQuestion && hasTimeSensitivePattern)
    );
  }
}
