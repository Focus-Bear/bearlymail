/**
 * Shared types for EmailSearchService.
 * Extracted to keep email-search.service.ts under the 800-line limit.
 */

import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";

// ---------------------------------------------------------------------------
// Instant search types (metadata-only + background enrichment)
// ---------------------------------------------------------------------------

/**
 * Lightweight result returned immediately from a metadata-only Gmail fetch.
 * Contains everything needed to render a search result card without syncing
 * the full message body.
 */
export interface GmailSearchResult {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  fromName?: string;
  // ISO 8601 date string
  date: string;
  snippet: string;
  isRead: boolean;
  labelIds: string[];
  enrichmentStatus: "pending" | "enriched" | "failed";
}

/**
 * Full result after DB sync + AI processing completes in the background.
 */
export interface EnrichedSearchResult extends GmailSearchResult {
  // BearlyMail DB ID
  id: string;
  body: string;
  htmlBody?: string;
  attachments?: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
  starCount?: number;
  priorityScore?: number | null;
  priorityExplanation?: string;
  relevanceScore?: number;
  searchExplanation?: string;
  enrichmentStatus: "enriched";
}

/**
 * Combined search response when INSTANT_SEARCH_ENABLED=true.
 * The `results` array contains a mix of GmailSearchResult (pending) and
 * EnrichedSearchResult (already synced to DB).
 */
export interface InstantSearchResponse {
  results: Array<GmailSearchResult | EnrichedSearchResult>;
  enrichmentJobId: string | null;
  query: string;
  queriesTried: QueryTried[];
  totalGmailResults: number;
}

/**
 * Status response returned by GET /emails/search/enrichment/:jobId.
 * The frontend polls this endpoint and merges enriched results in-place.
 */
export interface EnrichmentStatusResponse {
  jobId: string;
  status: "in-progress" | "complete" | "failed";
  progress: {
    total: number;
    enriched: number;
    failed: number;
  };
  /**
   * All enriched results available at the time of polling.
   * Every poll returns the full set — no cursor, no incremental drain.
   * Clients should merge into a Map keyed by email ID for idempotent deduplication.
   */
  enrichedResults: EnrichedSearchResult[];
}

/** Internal job state held by SearchEnrichmentService. */
export interface EnrichmentJob {
  id: string;
  userId: string;
  messageIds: string[];
  status: "in-progress" | "complete" | "failed";
  enrichedResults: EnrichedSearchResult[];
  progress: {
    total: number;
    enriched: number;
    failed: number;
  };
  createdAt: Date;
}

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
  maxSyncThreads?: number;
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
