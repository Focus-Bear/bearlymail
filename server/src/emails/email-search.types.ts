/**
 * Shared types for EmailSearchService.
 * Extracted to keep email-search.service.ts under the 800-line limit.
 */

import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";

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
  skipLlmFallback?: boolean;
  skipSync?: boolean;
}

/**
 * Build the debug info object attached to the first search result.
 */
export function buildSearchDebugInfo(options: {
  originalQuery: string;
  fallbackQuery: string;
  rawEmails: RawSearchEmail[];
  filteredEmails: Email[];
  allScores: Map<number, number>;
  now: Date;
  successfulQuery: string | null;
  gmailQueries: string[];
  queriesTried: QueryTried[];
  maxResults: number;
}): Record<string, unknown> {
  const {
    originalQuery,
    fallbackQuery,
    rawEmails,
    filteredEmails,
    allScores,
    now,
    successfulQuery,
    gmailQueries,
    queriesTried,
    maxResults,
  } = options;
  return {
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
}
