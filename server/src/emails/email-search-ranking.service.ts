import { Injectable, Logger } from "@nestjs/common";

import {
  PRIORITY_BOOSTS,
  PRIORITY_SCORES,
} from "../constants/priority-constants";
import { QUERY_LIMITS } from "../constants/query-limits";
import { DAYS, MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { LLMService } from "../llm/llm.service";
import { searchLogger } from "../utils/search-logger";

export type EmailWithRankingMetadata = Email & {
  searchExplanation?: string;
  relevanceScore?: number;
};

@Injectable()
export class EmailSearchRankingService {
  private readonly logger = new Logger(EmailSearchRankingService.name);

  constructor(private llmService: LLMService) {}

  async rankAndExplainEmails(
    userId: string,
    query: string,
    emails: Email[],
    maxResults: number,
    calculateDaysSinceLastEmail?: (
      userId: string,
      email: Partial<Email>,
    ) => Promise<number | undefined>,
  ): Promise<EmailWithRankingMetadata[]> {
    if (emails.length === 0) {
      return [];
    }

    const emailSummaries = await this.buildEmailSummaries(
      userId,
      emails,
      calculateDaysSinceLastEmail,
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
      const rankingPrompt = this.buildRankingPrompt(
        query,
        emailSummaries,
        daysSinceLastEmail,
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

      filteredEmails = this.applyRankingResponse(
        rankingResponse,
        emails,
        maxResults,
        allScores,
      );

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

    const explanationsMap = await this.generateSearchExplanations(
      userId,
      query,
      filteredEmails,
    );

    const emailsWithMetadata: EmailWithRankingMetadata[] = filteredEmails.map(
      (email, idx) => {
        const emailIndex = emails.indexOf(email);
        const relevanceScore = allScores.get(emailIndex) ?? undefined;
        return {
          ...email,
          searchExplanation:
            explanationsMap.get(idx) || "Filtered by AI relevance",
          relevanceScore,
        } as EmailWithRankingMetadata;
      },
    );

    emailsWithMetadata.sort(
      (itemA, itemB) =>
        (itemB.relevanceScore ?? 0) - (itemA.relevanceScore ?? 0),
    );

    return emailsWithMetadata;
  }

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
          maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_EXPLANATION,
        },
        undefined,
        userId,
      );

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const queries: unknown = JSON.parse(jsonMatch[0]);
        if (
          Array.isArray(queries) &&
          queries.every((query) => typeof query === "string")
        ) {
          return (queries as string[]).slice(0, 3);
        }
      }
    } catch (error) {
      this.logger.warn("Failed to generate alternative queries:", error);
    }

    const words = originalQuery
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .slice(0, 3);
    return words.length > 0 ? [words.join(" OR ")] : [];
  }

  private async buildEmailSummaries(
    userId: string,
    emails: Email[],
    calculateDaysSinceLastEmail?: (
      userId: string,
      email: Partial<Email>,
    ) => Promise<number | undefined>,
  ) {
    const now = new Date();
    return Promise.all(
      emails.map(async (email) => {
        const receivedDate = new Date(email.receivedAt);
        const daysAgo = Math.floor(
          (now.getTime() - receivedDate.getTime()) / MILLISECONDS.DAY,
        );
        const daysSinceLastEmail = calculateDaysSinceLastEmail
          ? await calculateDaysSinceLastEmail(userId, email)
          : undefined;
        return {
          index: emails.indexOf(email),
          from: email.fromName || email.from || "",
          subject: email.subject || "",
          snippet:
            (email.summary?.trim()
              ? email.summary
              : email.body?.substring(
                  0,
                  QUERY_LIMITS.SUBSTRING_SNIPPET_LENGTH,
                )) || "",
          daysAgo,
          isRecent: daysAgo <= DAYS.WEEK,
          daysSinceLastEmail,
        };
      }),
    );
  }

  private buildRankingPrompt(
    query: string,
    emailSummaries: Array<{
      index: number;
      from: string;
      subject: string;
      snippet: string;
      daysAgo: number;
      isRecent: boolean;
      daysSinceLastEmail: number | undefined;
    }>,
    daysSinceLastEmail: number | undefined,
    isTimeSensitive: boolean,
  ): string {
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

    const emailLines = emailSummaries
      .map((emailEntry) => {
        let recencyLabel = "";
        if (emailEntry.daysAgo === 0) recencyLabel = " (TODAY!)";
        else if (emailEntry.daysAgo <= 1) recencyLabel = " (LAST 24 HOURS!)";
        else if (emailEntry.isRecent) recencyLabel = " (RECENT)";
        return `${emailEntry.index}. From: ${emailEntry.from}, Subject: ${emailEntry.subject}, Received: ${emailEntry.daysAgo} days ago${recencyLabel}, Preview: ${emailEntry.snippet.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LONG)}...`;
      })
      .join("\n");

    return `You are an email search assistant. Rank these ${emailSummaries.length} emails by relevance to the search query: "${query}"

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

IMPORTANT: Score ALL ${emailSummaries.length} emails, even if they have low relevance. The user will see the scores and can decide which results to review.

Return a JSON array of objects with index and relevanceScore for ALL ${emailSummaries.length} emails, sorted by relevanceScore (highest first).

Format: [{"index": 2, "relevanceScore": 95}, {"index": 5, "relevanceScore": 87}, ...]

Emails:
${emailLines}

Return ONLY a JSON array of objects.`;
  }

  private applyRankingResponse(
    rankingResponse: string,
    emails: Email[],
    maxResults: number,
    allScores: Map<number, number>,
  ): Email[] {
    try {
      const jsonMatch = rankingResponse.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (!jsonMatch) return emails.slice(0, maxResults);

      const rankings: Array<{ index: number; relevanceScore: number }> =
        JSON.parse(jsonMatch[0]);
      if (!Array.isArray(rankings)) return emails.slice(0, maxResults);

      rankings.forEach((rank) =>
        allScores.set(rank.index, rank.relevanceScore),
      );

      // Sort all emails by relevance score (no filtering by threshold)
      // This allows users to see why low-scoring results were included
      const rankedEmails = emails.map((email, idx) => ({
        email,
        score: allScores.get(idx) ?? 0,
      }));
      rankedEmails.sort((itemA, itemB) => itemB.score - itemA.score);

      // Return top N results, regardless of score
      return rankedEmails
        .slice(0, maxResults)
        .map((emailEntry) => emailEntry.email);
    } catch (parseError) {
      this.logger.warn("Failed to parse AI ranking response:", parseError);
      return emails.slice(0, maxResults);
    }
  }

  private async generateSearchExplanations(
    userId: string,
    query: string,
    filteredEmails: Email[],
  ): Promise<Map<number, string>> {
    const explanationsMap = new Map<number, string>();
    if (filteredEmails.length === 0) return explanationsMap;
    try {
      const emailsForExplanation = filteredEmails.map((email, idx) => ({
        index: idx,
        from: email.fromName || email.from || "",
        subject: email.subject || "",
        body:
          email.summary?.trim() ||
          email.body?.substring(0, QUERY_LIMITS.SUBSTRING_SNIPPET_LENGTH) ||
          "",
        receivedAt: email.receivedAt
          ? email.receivedAt.toISOString()
          : new Date().toISOString(),
      }));
      const result =
        await this.llmService.generateSearchRelevanceExplanationsBatch(
          query,
          emailsForExplanation,
          userId,
        );
      result.forEach((value, key) => explanationsMap.set(key, value));
    } catch (error) {
      this.logger.warn("Batch explanation generation failed:", error);
    }
    return explanationsMap;
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

  /**
   * Convert a natural language search query to Gmail search syntax using LLM.
   * Falls back to keyword-OR search when LLM conversion fails.
   * Extracted from EmailSearchService as part of issue #939 batch 2.
   */
  async convertQueryToGmailSearch(
    userId: string,
    query: string,
  ): Promise<string> {
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
    if (gmailOperators.some((op) => query.toLowerCase().includes(op))) {
      return query;
    }

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
          maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_EXPLANATION,
        },
        undefined,
        userId,
      );
      const cleaned = response
        .trim()
        .replace(/^```[\w]*\n?/g, "")
        .replace(/\n?```$/g, "")
        .trim();
      if (
        cleaned.length > 0 &&
        cleaned.length < QUERY_LIMITS.SUBSTRING_BODY_PREVIEW
      ) {
        return cleaned;
      }
    } catch (error) {
      this.logger.warn("Failed to convert query using AI:", error);
    }

    const words = query
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .map((word) => `"${word}"`)
      .join(" OR ");
    return `subject:(${words}) OR ${words}`;
  }

  /**
   * Rank and filter emails by relevance score (no per-email explanations).
   * Returns filteredEmails, a score map, and the current date.
   * Extracted from EmailSearchService as part of issue #939 batch 2.
   */
  async rankEmails(
    userId: string,
    originalQuery: string,
    matchedEmails: Email[],
    maxResults: number,
    calculateDaysSinceLastEmail?: (
      userId: string,
      email: Partial<Email>,
    ) => Promise<number | undefined>,
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

    const emailSummaries = await this.buildEmailSummaries(
      userId,
      matchedEmails,
      calculateDaysSinceLastEmail,
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
            filteredEmails.sort((itemA, itemB) => {
              const scoreA = allScores.get(matchedEmails.indexOf(itemA)) ?? 0;
              const scoreB = allScores.get(matchedEmails.indexOf(itemB)) ?? 0;
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
}
