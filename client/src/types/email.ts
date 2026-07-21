// ---------------------------------------------------------------------------
// Summary debug (admin-only): which emails were fed to the summariser
// ---------------------------------------------------------------------------

/**
 * Admin-only debug payload returned by POST /summarize/:id describing exactly
 * which thread emails were included in the LLM prompt. Mirrors the server-side
 * SummaryDebugInfo. Used to verify the most-recent messages were summarised.
 */
export interface SummaryDebugInfo {
  threadId: string;
  totalThreadEmails: number;
  usedEmailIds: string[];
  usedMessages: Array<{ id: string; from: string; receivedAt: string }>;
}

// ---------------------------------------------------------------------------
// Instant search types (metadata-only + background enrichment)
// ---------------------------------------------------------------------------

/**
 * Lightweight result returned by the instant search path (INSTANT_SEARCH_ENABLED=true).
 * Contains only Gmail metadata — subject, from, date, snippet — but NOT the full body.
 */
export interface GmailSearchResult {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  fromName?: string;
  date: string; // ISO 8601
  snippet: string;
  isRead: boolean;
  labelIds: string[];
  enrichmentStatus: 'pending' | 'enriched' | 'failed';
}

/**
 * Full result returned by the enrichment polling endpoint once the backend has
 * synced the full body and run AI scoring.
 */
export interface EnrichedSearchResult extends GmailSearchResult {
  id: string;
  body: string;
  htmlBody?: string;
  attachments?: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
    contentId?: string;
    inlineData?: string;
  }>;
  starCount?: number;
  priorityScore?: number | null;
  relevanceScore?: number;
  searchExplanation?: string;
  enrichmentStatus: 'enriched';
}

/**
 * Lifecycle of the instant-search relevance ranking:
 * - GMAIL_ORDER: results are shown in Gmail's native order (no AI relevance yet)
 * - RE_RANKING:  background AI relevance re-rank is in flight
 * - RE_RANKED:   results have been reordered by AI relevance
 */
export const INSTANT_RANK_STATUS = {
  GMAIL_ORDER: 'gmail-order',
  RE_RANKING: 're-ranking',
  RE_RANKED: 're-ranked',
} as const;

export type InstantRankStatus = (typeof INSTANT_RANK_STATUS)[keyof typeof INSTANT_RANK_STATUS];

/**
 * Combined instant search response shape (when INSTANT_SEARCH_ENABLED=true on backend).
 * The `results` array holds GmailSearchResult items initially; enriched items are
 * merged in-place via polling.
 */
export interface InstantSearchResponse {
  results: Array<GmailSearchResult | EnrichedSearchResult>;
  enrichmentJobId: string | null;
  query: string;
  queriesTried: Array<{ query: string; resultCount: number; accountType?: string }>;
  totalGmailResults: number;
}

/**
 * Enrichment status response returned by GET /emails/search/enrichment/:jobId.
 */
export interface EnrichmentStatusResponse {
  jobId: string;
  status: 'in-progress' | 'complete' | 'failed';
  progress: {
    total: number;
    enriched: number;
    failed: number;
  };
  enrichedResults: EnrichedSearchResult[];
}

// ---------------------------------------------------------------------------

export interface GitHubLinkAuthor {
  login: string;
  type: 'User' | 'Bot' | 'Organization';
}

export interface GitHubReviewerDetail {
  approvalCount: number;
  changesRequestedCount: number;
  /** Reviewers requested but not yet reviewed; team slugs are prefixed with "@". */
  requestedReviewers: string[];
}

export interface GitHubChecksSummary {
  state: 'passing' | 'failing' | 'pending' | 'none';
  total: number;
  failingChecks: string[];
}

export interface GitHubLinkStatus {
  state: 'open' | 'closed' | 'merged';
  title?: string;
  labels?: Array<{ name: string; color: string }>;
  assignees?: Array<{ login: string; avatar_url: string }>;
  author?: GitHubLinkAuthor;
  projects?: Array<{
    name: string;
    status?: string;
  }>;
  reviewStatus?: 'approved' | 'changes_requested' | 'pending' | null;
  reviewerDetail?: GitHubReviewerDetail;
  checks?: GitHubChecksSummary;
  commentsCount?: number;
  mergeable?: boolean | null;
  merged?: boolean;
}

export interface GitHubLink {
  type: 'issue' | 'pr';
  repo: string;
  owner: string;
  number: number;
  url: string;
  status?: GitHubLinkStatus;
  fetchedAt?: string;
}

/**
 * Which process assigned a thread's category. Mirrors the server-derived
 * `categorizationSource` bucket (see server `category-source.helper.ts`); the
 * popover maps each kind to a translated "Categorised by" label.
 */
export type CategorizationSource = 'user' | 'rule' | 'local' | 'proto' | 'ai';

export interface Email {
  id: string;
  threadId: string;
  /** Provider message id (e.g. Gmail), when returned by the API */
  messageId?: string;
  from: string;
  fromName?: string;
  to?: string;
  cc?: string;
  replyTo?: string;
  subject: string;
  body?: string;
  htmlBody?: string; // HTML content of the email (may not be available in list view for performance)
  priorityExplanation?: PriorityExplanation | null;
  isRead: boolean;
  isSnoozed: boolean;
  snoozeUntil?: string;
  receivedAt: string;
  isProcessingPriority?: boolean;
  isProcessingSummary?: boolean;
  summary?: string | null;
  // How `summary` was produced. 'deterministic' is a cheap text placeholder for
  // low-priority threads; the detail view upgrades it to an LLM summary on open.
  summarySource?: 'llm' | 'deterministic' | null;
  starCount?: number;
  isArchived?: boolean;
  lastCheckedAt?: string | null;
  labels?: string[];
  lastTheirReplyAt?: string;
  lastMyReplyAt?: string;
  followUpDueAt?: string;
  urgencyScore?: number; // Thread-level urgency score (0-100)
  urgencyExplanation?: string | null; // Thread-level urgency explanation
  emailThreadId?: string; // Database thread ID for override endpoint
  threadUpdatedAt?: string; // Thread updatedAt timestamp for stable sorting
  githubMetadata?: {
    links: GitHubLink[];
  };
  // Metadata for list view
  actionItemsCount?: number;
  hasPrivateNote?: boolean;
  // Emergency delivery flag - true if email was delivered early due to high priority
  wasDeliveredEarly?: boolean;
  // Batching info for debug
  isBatched?: boolean;
  batchReleaseAt?: string | null;
  batchDecisionReason?: string | null;
  // True when AI processing was skipped due to user inactivity; backlog processing will catch up
  aiProcessingDeferred?: boolean;
  // Email attachments
  attachments?: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
    /** CID reference used to resolve inline images in the HTML body. */
    contentId?: string;
    /** Base64-encoded content for small inline images embedded directly by Gmail. */
    inlineData?: string;
  }>;
  // Phishing detection signal (populated after summarisation)
  phishingConfidence?: 'low' | 'medium' | 'high' | null;
  phishingReason?: string | null;
  // Email category for grouping (e.g., Newsletters, Sales, Customer Support)
  category?: string | null;
  // UUID of the UserContext entry for this category — stable identifier returned by the server.
  // Use this as the primary key for category grouping; falls back to `category` name when absent.
  category_id?: string | null;
  // Explanation of why this category was chosen (especially useful for "Other")
  categoryExplanation?: string | null;
  // Which process assigned the category (surfaced as a "Categorised by" line in the popover)
  categorizationSource?: CategorizationSource | null;
  // Proto category name for emails in "Other" category
  protoCategoryName?: string | null;
  // Proto category description for emails in "Other" category
  protoCategoryDescription?: string | null;
  // Correspondent info for display (the other person in the conversation)
  correspondentEmail?: string | null;
  correspondentName?: string | null;
  // Pre-resolved contact ID for the sender (populated at ingest). Enables instant
  // navigation to the contact page without a search API call on every click.
  senderContactId?: string | null;
  // CRM contact type for the correspondent (loaded asynchronously)
  contactType?: string | null;
  // Auto-responder metadata (autoresponded inbox mode)
  autoRespondedAt?: string | null;
  autoResponseCount?: number;
  // Pre-calculated thread-level priority score from the backend (single source of truth).
  // Use this instead of recalculating from priorityExplanation.breakdown to avoid divergence.
  priorityScore?: number | null;
  // Search-specific debug metadata (populated only on no-results markers and search enrichment).
  debugInfo?: Record<string, unknown>;
  // Follow-up thread metadata (populated server-side for follow-up mode).
  otherPersonName?: string;
}

export interface TriageSuggestion {
  suggestedStarCount: number;
  suggestedArchive: boolean;
  confidence: number;
  reasoning: string;
}

export interface PriorityExplanation {
  score: number;
  dimensions?: {
    urgency: { score: number; reasons: string[] };
    goalAlignment: { score: number; reasons: string[] };
    vipContact: { score: number; reasons: string[] };
    sentiment?: { score: number; type: string; reasons: string[] };
  };
  breakdown: Array<{ factor: string; value: number; description: string }>;
}

export type InboxMode = 'triage' | 'action' | 'follow-up' | 'blocked' | 'autoresponded' | 'scheduled';

/**
 * Get the priority score for an email.
 * Uses the pre-calculated backend priorityScore (single source of truth) to avoid
 * divergence between the badge display and the server-side minPriority filter.
 * Falls back to recalculating from breakdown if priorityScore is not present.
 * @param email The email object
 * @returns The priority score (can be negative), or 0 if unavailable
 */
export function getEmailPriorityScore(email: Email): number {
  // Use the denormalized thread-level score from the backend (single source of truth)
  if (email.priorityScore != null) {
    return email.priorityScore;
  }
  // Fallback: recalculate from breakdown if priorityScore not present
  if (!email.priorityExplanation || !email.priorityExplanation.breakdown) {
    return 0;
  }
  return email.priorityExplanation.breakdown.reduce((sum, item) => sum + (item.value || 0), 0);
}

/**
 * Returns true only when the backend is actively calculating an email's
 * priority (isProcessingPriority=true). Use this to gate the "Calculating..."
 * spinner so it is only shown when a job is genuinely in flight — never for an
 * email that has silently failed prioritisation and has nothing running.
 */
export function isEmailPriorityCalculating(email: Email): boolean {
  return email.isProcessingPriority === true;
}

/**
 * Returns true when an email has no usable priority but nothing is calculating
 * it — no score AND no breakdown AND isProcessingPriority=false. This is the
 * "stuck/failed" state: a prior prioritisation never completed and no job is
 * running. The UI surfaces it as "Not prioritised" (clickable to retry) rather
 * than a misleading perpetual "Calculating..." spinner.
 *
 * A thread that was never scored has a null priorityScore; an explicit score of
 * 0 is a legitimately resolved low priority (not stuck), so we check the raw
 * priorityScore for null/undefined rather than the 0-coalesced getEmailPriorityScore.
 */
export function isEmailPriorityUnresolved(email: Email): boolean {
  if (email.isProcessingPriority) {
    return false;
  }
  const hasScore = email.priorityScore != null;
  const hasBreakdown = email.priorityExplanation?.breakdown != null && email.priorityExplanation.breakdown.length > 0;
  return !hasScore && !hasBreakdown;
}
