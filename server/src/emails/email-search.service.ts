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

// Type for emails with search metadata
// Note: We use a type intersection instead of extends to avoid getPriorityScore requirement issues
export type EmailWithMetadata = Email & {
  searchExplanation?: string;
  relevanceScore?: number;
  debugInfo?: Record<string, unknown>;
};

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
  ) {}

  /**
   * Search emails using natural language query
   * Converts query to Gmail syntax, searches, and ranks results using AI
   */
  async searchEmails(
    userId: string,
    query: string,
    maxResults: number = QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE,
    onProgress?: (step: string, message: string) => void,
    calculateDaysSinceLastEmail?: (
      userId: string,
      email: Partial<Email>,
    ) => Promise<number | undefined>,
    accountTypes?: string[],
    skipLlmRanking?: boolean,
  ): Promise<
    Array<
      Email & {
        searchExplanation?: string;
        relevanceScore?: number;
        debugInfo?: Record<string, unknown>;
      }
    >
  > {
    const originalQuery = query;
    const queriesTried: Array<{
      query: string;
      resultCount: number;
      accountType?: string;
    }> = [];
    const searchStartTime = Date.now();

    // Log search start
    searchLogger.logSearchStart(userId, originalQuery);

    try {
      // Get connected providers based on filter
      const connectedProviders =
        await this.emailProviderManager.getAllConnectedProviders(userId);

      if (connectedProviders.length === 0) {
        this.logger.warn(`No email provider connected for user ${userId}`);
        searchLogger.logSearchError(
          userId,
          originalQuery,
          "No email provider connected",
        );
        return [
          {
            id: "no-results",
            subject: "",
            from: "",
            body: "",
            receivedAt: new Date().toISOString(),
            debugInfo: {
              originalQuery,
              queriesTried: [],
              message: "No email provider connected",
            },
          } as unknown as EmailWithMetadata,
        ];
      }

      // Filter providers if accountTypes is specified
      const providersToSearch = accountTypes
        ? connectedProviders.filter((p) => accountTypes.includes(p.type))
        : connectedProviders;

      if (providersToSearch.length === 0) {
        this.logger.warn(
          `No matching email providers for user ${userId} with filter ${accountTypes?.join(", ")}`,
        );
        return [
          {
            id: "no-results",
            subject: "",
            from: "",
            body: "",
            receivedAt: new Date().toISOString(),
            debugInfo: {
              originalQuery,
              queriesTried: [],
              message: `No matching email accounts found for the selected filters: ${accountTypes?.join(", ")}`,
            },
          } as unknown as EmailWithMetadata,
        ];
      }

      // Step 1: Generate query variations and try them in order
      onProgress?.("converting", "Crafting search query for Gmail...");

      // Generate natural language variations first
      // Simple implementation: use query as-is
      const naturalVariations = [query];
      this.logger.log(
        `[SEARCH] Generated ${naturalVariations.length} variations: ${naturalVariations.join(", ")}`,
      );
      searchLogger.logQueryVariations(userId, originalQuery, naturalVariations);

      // Convert each variation to Gmail syntax
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
          this.logger.warn(
            `Failed to convert variation "${naturalVar}"`,
            error,
          );
        }
      }

      // If no variations were generated, use the original conversion
      if (gmailQueries.length === 0) {
        const gmailQuery = await this.convertQueryToGmailSearch(userId, query);
        gmailQueries.push(gmailQuery);
      }

      // Always also try the original raw query as a fallback
      // (LLM conversion can be overly specific, e.g. adding subject: prefix)
      if (!gmailQueries.includes(query)) {
        gmailQueries.push(query);
      }

      this.logger.log(
        `[SEARCH] Will try ${gmailQueries.length} Gmail queries: ${gmailQueries.join(", ")}`,
      );
      searchLogger.logGmailQueries(userId, originalQuery, gmailQueries);

      // Step 2: Search across all selected providers
      onProgress?.(
        "searching",
        `Searching for emails across ${providersToSearch.length} account(s)...`,
      );
      const initialMaxResults = QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE;
      const allRawEmails: Array<{
        receivedAt: Date;
        from?: string;
        fromName?: string;
        subject?: string;
        messageId?: string;
        [key: string]: unknown;
      }> = [];
      let successfulQuery: string | null = null;

      // Search each provider
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
              allRawEmails.push(
                ...(searchResults as unknown as Array<{
                  receivedAt: Date;
                  from?: string;
                  fromName?: string;
                  subject?: string;
                  messageId?: string;
                  [key: string]: unknown;
                }>),
              );
              successfulQuery = gmailQuery;
              this.logger.log(
                `[SEARCH] Query "${gmailQuery}" on ${providerInfo.type} returned ${searchResults.length} results`,
              );
              break; // Found results for this provider, move to next provider
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

      const rawEmails = allRawEmails;

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
      const messageIds = rawEmails
        .map((e) => e.messageId as string | undefined)
        .filter((id): id is string => id !== null && id !== undefined);

      if (messageIds.length === 0) {
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
              message: "Emails found in Gmail but not yet synced to BearlyMail",
            },
          } as unknown as EmailWithMetadata,
        ];
      }

      // Fetch emails from our database
      const dbEmails = await this.emailRepository.find({
        where: {
          userId,
          messageId: In(messageIds as string[]),
        },
        order: { receivedAt: "DESC" },
      });

      // Create a map for quick lookup
      const emailMap = new Map(dbEmails.map((e) => [e.messageId, e]));

      // Match raw emails with database emails and preserve order
      const matchedEmails: Email[] = [];
      for (const rawEmail of rawEmails) {
        const messageId = rawEmail.messageId as string | undefined;
        if (messageId && emailMap.has(messageId)) {
          matchedEmails.push(emailMap.get(messageId)!);
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
              message: "Emails found in Gmail but not yet synced to BearlyMail",
            },
          } as unknown as EmailWithMetadata,
        ];
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

      // Step 4: Calculate days since last email for each email (for recency scoring)
      onProgress?.("analyzing", "Analyzing email relevance...");
      const now = new Date();
      const emailSummaries = await Promise.all(
        matchedEmails.map(async (email) => {
          const receivedDate = new Date(email.receivedAt);
          const daysAgo = Math.floor(
            (now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          const daysSinceLastEmail = calculateDaysSinceLastEmail
            ? await calculateDaysSinceLastEmail(userId, email)
            : undefined;

          return {
            index: matchedEmails.indexOf(email),
            from: email.fromName || email.from || "",
            subject: email.subject || "",
            snippet: email.body?.substring(0, 200) || "",
            daysAgo,
            isRecent: daysAgo <= DAYS.WEEK,
            daysSinceLastEmail,
          };
        }),
      );

      // Find the most recent email's daysSinceLastEmail for context
      const mostRecentEmail = matchedEmails[0];
      const daysSinceLastEmail = calculateDaysSinceLastEmail
        ? await calculateDaysSinceLastEmail(userId, mostRecentEmail)
        : undefined;

      // Use AI to filter and rank results if we have multiple results
      let filteredEmails = matchedEmails;
      // Track scores for all emails (for debug)
      const allScores: Map<number, number> = new Map();

      // Always score emails, even if we don't need to filter
      if (matchedEmails.length > 0) {
        try {
          searchLogger.logAIScoringStart(
            userId,
            originalQuery,
            matchedEmails.length,
          );

          // Detect if query is time-sensitive
          const isTimeSensitive = this.isTimeSensitiveQuery(originalQuery);

          // Adjust recency penalties based on time-sensitivity
          // For time-sensitive queries (e.g., "Is Jay coming to the meeting?"),
          // older emails are much less relevant
          const recencyToday = PRIORITY_BOOSTS.RECENCY_TODAY;
          const recency24H = PRIORITY_BOOSTS.RECENCY_24H;
          const recency7D = PRIORITY_BOOSTS.RECENCY_7D;
          const recency30D = PRIORITY_BOOSTS.RECENCY_30D;
          // Stronger penalties for old emails in time-sensitive queries
          const recency30DPenalty = isTimeSensitive
            ? PRIORITY_BOOSTS.RECENCY_30D_PENALTY *
              QUERY_LIMITS.SEARCH_RELEVANCE_MULTIPLIER // 50% stronger penalty
            : PRIORITY_BOOSTS.RECENCY_30D_PENALTY;
          const recency60DPenalty = isTimeSensitive
            ? PRIORITY_BOOSTS.RECENCY_60D_PENALTY *
              QUERY_LIMITS.SEARCH_RELEVANCE_MULTIPLIER // 50% stronger penalty
            : PRIORITY_BOOSTS.RECENCY_60D_PENALTY;

          const timeSensitivityNote = isTimeSensitive
            ? "\n\n⚠️ TIME-SENSITIVE QUERY DETECTED: This query appears to be about a meeting, event, or time-sensitive question. OLDER emails should be penalized MORE HEAVILY as they are likely about past events, not the current question. Emails older than 30 days should receive significantly lower scores unless they are extremely relevant."
            : "";

          // Use AI to rank ALL emails by relevance to the ORIGINAL query (prioritizing newer emails) with scores
          const rankingPrompt = `You are an email search assistant. Rank these ${emailSummaries.length} emails by relevance to the search query: "${originalQuery}"

IMPORTANT CONTEXT:
- The most recent email in this set was received ${daysSinceLastEmail} days ago (daysSinceLastEmail: ${daysSinceLastEmail})
- Prioritize RECENT emails heavily - if two emails are equally relevant, the more recent one should rank much higher${timeSensitivityNote}

CRITICAL RELEVANCE RULES:
1. If the query asks about a specific person (e.g., "Is Jay coming?"), emails MUST be from that person or mention them prominently to be relevant
2. Emails that don't mention the person at all should get a score of 0-20 (not relevant)
3. Emails from automated services (like "Fireflies.ai", "noreply", etc.) that don't mention the person should get very low scores (0-15)
4. Only emails that directly relate to the query should score above ${PRIORITY_SCORES.MEDIUM_THRESHOLD}

CRITICAL RECENCY RULES (apply these bonuses/penalties):
- Emails from TODAY (0 days ago) should get a +${recencyToday} bonus (STRONG priority for today's emails)
- Emails from the last 24 hours (0-1 days ago) should get a +${recency24H} bonus
- Emails from the last ${DAYS.WEEK} days should get a +${recency7D} bonus
- Emails from ${DAYS.WEEK + 1}-${DAYS.MONTH} days ago should get a +${recency30D} bonus
- Emails older than ${DAYS.MONTH} days should get a ${recency30DPenalty} penalty (${isTimeSensitive ? "VERY STRONG" : "STRONG"} penalty for old emails${isTimeSensitive ? " - time-sensitive query" : ""})
- Emails older than 60 days should get a ${recency60DPenalty} penalty (${isTimeSensitive ? "EXTREMELY STRONG" : "VERY STRONG"} penalty${isTimeSensitive ? " - time-sensitive query" : ""})

RELEVANCE SCORING (base score before recency adjustment):
- 100 = Perfect match, directly answers the question (e.g., email from Jay about the meeting)
- 80-99 = Very relevant, strong connection to query
- 60-79 = Moderately relevant, some connection
- 40-59 = Somewhat relevant, weak connection
- 20-39 = Barely relevant, minimal connection
- 0-19 = Not relevant at all (e.g., automated emails that don't mention the person)

Then apply the recency bonus/penalty above. Final score = base score + recency adjustment (capped at 0-100).

STRICT FILTERING: Only include emails with final score >= ${PRIORITY_BOOSTS.RELEVANCE_THRESHOLD} in the top results. Emails scoring below ${PRIORITY_BOOSTS.RELEVANCE_THRESHOLD} should be excluded even if they're recent.

Return a JSON array of objects with index and relevanceScore for ALL ${emailSummaries.length} emails, sorted by relevanceScore (highest first).

Format: [{"index": 2, "relevanceScore": 95}, {"index": 5, "relevanceScore": 87}, ...]

Emails:
${emailSummaries
  .map((e, index) => {
    let recencyLabel = "";
    if (e.daysAgo === 0) {
      recencyLabel = " (TODAY!)";
    } else if (e.daysAgo <= 1) {
      recencyLabel = " (LAST 24 HOURS!)";
    } else if (e.isRecent) {
      recencyLabel = " (RECENT)";
    }
    return `${index}. From: ${e.from}, Subject: ${e.subject}, Received: ${e.daysAgo} days ago${recencyLabel}, Preview: ${e.snippet.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LONG)}...`;
  })
  .join("\n")}

Return ONLY a JSON array of objects.`;

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

          // Parse ranking response
          try {
            const jsonMatch = rankingResponse.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            if (jsonMatch) {
              const rankings: Array<{
                index: number;
                relevanceScore: number;
              }> = JSON.parse(jsonMatch[0]);

              // Validate rankings
              if (Array.isArray(rankings)) {
                // Store scores for all emails
                rankings.forEach((rank) => {
                  allScores.set(rank.index, rank.relevanceScore);
                });

                // Filter emails by relevance threshold
                filteredEmails = matchedEmails.filter((email, index) => {
                  const score = allScores.get(index) ?? 0;
                  return score >= PRIORITY_BOOSTS.RELEVANCE_THRESHOLD;
                });

                // Sort by relevance score (highest first)
                filteredEmails.sort((a, b) => {
                  const indexA = matchedEmails.indexOf(a);
                  const indexB = matchedEmails.indexOf(b);
                  const scoreA = allScores.get(indexA) ?? 0;
                  const scoreB = allScores.get(indexB) ?? 0;
                  return scoreB - scoreA;
                });

                // Limit to maxResults
                filteredEmails = filteredEmails.slice(0, maxResults);
              }
            }
          } catch (parseError) {
            this.logger.warn(
              "Failed to parse AI ranking response, using all results:",
              parseError,
            );
            // Fall back to all results, sorted by date
            filteredEmails = matchedEmails.slice(0, maxResults);
          }
        } catch (error) {
          this.logger.error("AI ranking failed, using all results:", error);
          // Fall back to all results, sorted by date
          filteredEmails = matchedEmails.slice(0, maxResults);
        }
      } else {
        // No need for AI ranking if we have few results
        filteredEmails = matchedEmails.slice(0, maxResults);
      }

      // Generate search relevance explanations in a single batch LLM call
      onProgress?.("explaining", "Generating explanations...");
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

      // Add search explanation and relevance scores to emails
      const emailsWithMetadata: EmailWithMetadata[] = filteredEmails.map(
        (email, idx) => {
          const emailIndex = matchedEmails.indexOf(email);
          const relevanceScore = allScores.get(emailIndex) ?? undefined;

          const emailWithMeta = {
            ...email,
            searchExplanation:
              explanationsMap.get(idx) ||
              (successfulQuery
                ? `Found using query: "${successfulQuery}"`
                : "Search completed"),
            relevanceScore,
          } as EmailWithMetadata;

          return emailWithMeta;
        },
      );

      // Build debug info
      const debugInfo = {
        originalQuery,
        gmailQuery: successfulQuery || gmailQueries[0] || query,
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

      // Sort results by relevance score (highest first) before returning
      emailsWithMetadata.sort((a, b) => {
        const scoreA = a.relevanceScore ?? 0;
        const scoreB = b.relevanceScore ?? 0;
        // Descending order
        return scoreB - scoreA;
      });

      // Return emails with metadata (explanations and relevance scores)
      // Add debug info to first email only (to avoid bloating response)
      const result = emailsWithMetadata.map((email, index) => {
        // Email already has getPriorityScore method, just add debug info if needed
        const emailWithMeta = email as EmailWithMetadata;
        if (index === 0) {
          emailWithMeta.debugInfo = debugInfo;
        }
        return emailWithMeta;
      });

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
    Array<
      Email & {
        searchExplanation?: string;
        relevanceScore?: number;
      }
    >
  > {
    if (emails.length === 0) {
      return [];
    }

    const now = new Date();
    const emailSummaries = await Promise.all(
      emails.map(async (email) => {
        const receivedDate = new Date(email.receivedAt);
        const daysAgo = Math.floor(
          (now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        const daysSinceLastEmail = calculateDaysSinceLastEmail
          ? await calculateDaysSinceLastEmail(userId, email)
          : undefined;
        return {
          index: emails.indexOf(email),
          from: email.fromName || email.from || "",
          subject: email.subject || "",
          snippet: email.body?.substring(0, 200) || "",
          daysAgo,
          isRecent: daysAgo <= DAYS.WEEK,
          daysSinceLastEmail,
        };
      }),
    );

    const mostRecentEmail = emails[0];
    const daysSinceLastEmail = calculateDaysSinceLastEmail
      ? await calculateDaysSinceLastEmail(userId, mostRecentEmail)
      : undefined;

    let filteredEmails = emails;
    const allScores: Map<number, number> = new Map();

    try {
      searchLogger.logAIScoringStart(userId, query, emails.length);
      const isTimeSensitive = this.isTimeSensitiveQuery(query);
      const recencyToday = PRIORITY_BOOSTS.RECENCY_TODAY;
      const recency24H = PRIORITY_BOOSTS.RECENCY_24H;
      const recency7D = PRIORITY_BOOSTS.RECENCY_7D;
      const recency30D = PRIORITY_BOOSTS.RECENCY_30D;
      const recency30DPenalty = isTimeSensitive
        ? PRIORITY_BOOSTS.RECENCY_30D_PENALTY *
          QUERY_LIMITS.SEARCH_RELEVANCE_MULTIPLIER
        : PRIORITY_BOOSTS.RECENCY_30D_PENALTY;
      const recency60DPenalty = isTimeSensitive
        ? PRIORITY_BOOSTS.RECENCY_60D_PENALTY *
          QUERY_LIMITS.SEARCH_RELEVANCE_MULTIPLIER
        : PRIORITY_BOOSTS.RECENCY_60D_PENALTY;
      const timeSensitivityNote = isTimeSensitive
        ? "\n\n⚠️ TIME-SENSITIVE QUERY DETECTED: This query appears to be about a meeting, event, or time-sensitive question. OLDER emails should be penalized MORE HEAVILY as they are likely about past events, not the current question. Emails older than 30 days should receive significantly lower scores unless they are extremely relevant."
        : "";

      const rankingPrompt = `You are an email search assistant. Rank these ${emailSummaries.length} emails by relevance to the search query: "${query}"

IMPORTANT CONTEXT:
- The most recent email in this set was received ${daysSinceLastEmail} days ago (daysSinceLastEmail: ${daysSinceLastEmail})
- Prioritize RECENT emails heavily - if two emails are equally relevant, the more recent one should rank much higher${timeSensitivityNote}

CRITICAL RELEVANCE RULES:
1. If the query asks about a specific person (e.g., "Is Jay coming?"), emails MUST be from that person or mention them prominently to be relevant
2. Emails that don't mention the person at all should get a score of 0-20 (not relevant)
3. Emails from automated services (like "Fireflies.ai", "noreply", etc.) that don't mention the person should get very low scores (0-15)
4. Only emails that directly relate to the query should score above ${PRIORITY_SCORES.MEDIUM_THRESHOLD}

CRITICAL RECENCY RULES (apply these bonuses/penalties):
- Emails from TODAY (0 days ago) should get a +${recencyToday} bonus (STRONG priority for today's emails)
- Emails from the last 24 hours (0-1 days ago) should get a +${recency24H} bonus
- Emails from the last ${DAYS.WEEK} days should get a +${recency7D} bonus
- Emails from ${DAYS.WEEK + 1}-${DAYS.MONTH} days ago should get a +${recency30D} bonus
- Emails older than ${DAYS.MONTH} days should get a ${recency30DPenalty} penalty (${isTimeSensitive ? "VERY STRONG" : "STRONG"} penalty for old emails${isTimeSensitive ? " - time-sensitive query" : ""})
- Emails older than 60 days should get a ${recency60DPenalty} penalty (${isTimeSensitive ? "EXTREMELY STRONG" : "VERY STRONG"} penalty${isTimeSensitive ? " - time-sensitive query" : ""})

RELEVANCE SCORING (base score before recency adjustment):
- 100 = Perfect match, directly answers the question (e.g., email from Jay about the meeting)
- 80-99 = Very relevant, strong connection to query
- 60-79 = Moderately relevant, some connection
- 40-59 = Somewhat relevant, weak connection
- 20-39 = Barely relevant, minimal connection
- 0-19 = Not relevant at all (e.g., automated emails that don't mention the person)

Then apply the recency bonus/penalty above. Final score = base score + recency adjustment (capped at 0-100).

STRICT FILTERING: Only include emails with final score >= ${PRIORITY_BOOSTS.RELEVANCE_THRESHOLD} in the top results. Emails scoring below ${PRIORITY_BOOSTS.RELEVANCE_THRESHOLD} should be excluded even if they're recent.

Return a JSON array of objects with index and relevanceScore for ALL ${emailSummaries.length} emails, sorted by relevanceScore (highest first).

Format: [{"index": 2, "relevanceScore": 95}, {"index": 5, "relevanceScore": 87}, ...]

Emails:
${emailSummaries
  .map((e) => {
    let recencyLabel = "";
    if (e.daysAgo === 0) {
      recencyLabel = " (TODAY!)";
    } else if (e.daysAgo <= 1) {
      recencyLabel = " (LAST 24 HOURS!)";
    } else if (e.isRecent) {
      recencyLabel = " (RECENT)";
    }
    return `${e.index}. From: ${e.from}, Subject: ${e.subject}, Received: ${e.daysAgo} days ago${recencyLabel}, Preview: ${e.snippet.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LONG)}...`;
  })
  .join("\n")}

Return ONLY a JSON array of objects.`;

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

      try {
        const jsonMatch = rankingResponse.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          const rankings: Array<{ index: number; relevanceScore: number }> =
            JSON.parse(jsonMatch[0]);
          if (Array.isArray(rankings)) {
            rankings.forEach((rank) => {
              allScores.set(rank.index, rank.relevanceScore);
            });
            filteredEmails = emails.filter((_, index) => {
              const score = allScores.get(index) ?? 0;
              return score >= PRIORITY_BOOSTS.RELEVANCE_THRESHOLD;
            });
            filteredEmails.sort((a, b) => {
              const indexA = emails.indexOf(a);
              const indexB = emails.indexOf(b);
              const scoreA = allScores.get(indexA) ?? 0;
              const scoreB = allScores.get(indexB) ?? 0;
              return scoreB - scoreA;
            });
            filteredEmails = filteredEmails.slice(0, maxResults);

            // Safety net: if LLM filtered everything out, show top results anyway
            // so user always sees something rather than empty results
            const FALLBACK_RESULT_COUNT = 3;
            if (filteredEmails.length === 0 && emails.length > 0) {
              this.logger.warn(
                `All ${emails.length} results filtered below threshold - showing top ${FALLBACK_RESULT_COUNT} as fallback`,
              );
              const emailsWithScores = emails.map((e, idx) => ({
                email: e,
                score: allScores.get(idx) ?? 0,
              }));
              emailsWithScores.sort((a, b) => b.score - a.score);
              filteredEmails = emailsWithScores
                .slice(0, FALLBACK_RESULT_COUNT)
                .map((e) => e.email);
            }
          }
        }
      } catch (parseError) {
        this.logger.warn("Failed to parse AI ranking response:", parseError);
        filteredEmails = emails.slice(0, maxResults);
      }

      searchLogger.logAIScoringComplete(
        userId,
        query,
        emails.length,
        filteredEmails.length,
        emails.length - filteredEmails.length,
      );
    } catch (error) {
      this.logger.error("AI ranking failed, using all results:", error);
      filteredEmails = emails.slice(0, maxResults);
    }

    // Generate explanations
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
            query,
            emailsForExplanation,
            userId,
          );
      } catch (error) {
        this.logger.warn("Batch explanation generation failed:", error);
      }
    }

    const emailsWithMetadata: EmailWithMetadata[] = filteredEmails.map(
      (email, idx) => {
        const emailIndex = emails.indexOf(email);
        const relevanceScore = allScores.get(emailIndex) ?? undefined;
        return {
          ...email,
          searchExplanation:
            explanationsMap.get(idx) || "Filtered by AI relevance",
          relevanceScore,
        } as EmailWithMetadata;
      },
    );

    emailsWithMetadata.sort((a, b) => {
      const scoreA = a.relevanceScore ?? 0;
      const scoreB = b.relevanceScore ?? 0;
      return scoreB - scoreA;
    });

    return emailsWithMetadata;
  }

  /**
   * Check if a query is time-sensitive (e.g., about meetings, events, future plans)
   */
  private isTimeSensitiveQuery(query: string): boolean {
    const lowerQuery = query.toLowerCase();

    // Patterns that indicate time-sensitive queries
    const timeSensitivePatterns = [
      // Questions about attendance/participation
      /\b(is|are|will|coming|going|attending|joining|participating)\b/i,
      // Meeting-related
      /\b(meeting|appointment|call|conference|event|gathering|session)\b/i,
      // Time-related questions
      /\b(when|what time|what day|which day|tomorrow|today|this week|next week)\b/i,
      // Status questions
      /\b(status|confirmed|cancel|reschedule|postpone)\b/i,
      // Questions about future plans
      /\b(plan|schedule|arrange|organize|set up)\b/i,
    ];

    // Check if query contains question words AND time-sensitive patterns
    const hasQuestionWord = /\b(is|are|will|when|what|where|who|how)\b/i.test(
      lowerQuery,
    );
    const hasTimeSensitivePattern = timeSensitivePatterns.some((pattern) =>
      pattern.test(lowerQuery),
    );

    // Also check for direct questions (starts with question word or contains "?")
    const isDirectQuestion =
      /\b(is|are|will|when|what|where|who|how)\b/i.test(
        lowerQuery.trim().split(/\s+/)[0],
      ) || lowerQuery.includes("?");

    return (
      (hasQuestionWord && hasTimeSensitivePattern) ||
      (isDirectQuestion && hasTimeSensitivePattern)
    );
  }

  /**
   * Generate alternative/broader search queries when initial search yields no good results.
   */
  async generateAlternativeQueries(
    userId: string,
    originalQuery: string,
  ): Promise<string[]> {
    try {
      const prompt = `The user searched for: "${originalQuery}" but got no relevant email results.
Generate 2-3 alternative search queries that are broader or use different keywords to find the same information.
Return a JSON array of query strings only.
Format: ["alternative query 1", "alternative query 2"]`;

      const response = await this.llmService.generateText(
        {
          prompt,
          systemPrompt:
            "You are an email search assistant. Return only a JSON array of strings, no other text.",
          temperature: 0.5,
          maxTokens: 200,
        },
        undefined,
        userId,
      );

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const queries: unknown = JSON.parse(jsonMatch[0]);
        if (
          Array.isArray(queries) &&
          queries.every((q) => typeof q === "string")
        ) {
          return (queries as string[]).slice(0, 3);
        }
      }
    } catch (error) {
      this.logger.warn("Failed to generate alternative queries:", error);
    }

    // Fallback: use individual words from the original query
    const words = originalQuery
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 3);
    return words.length > 0 ? [words.join(" OR ")] : [];
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
    const alternativeQueries = await this.generateAlternativeQueries(
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
}
