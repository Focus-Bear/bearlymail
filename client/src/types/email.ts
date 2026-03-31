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
  }>;
  starCount?: number;
  priorityScore?: number | null;
  relevanceScore?: number;
  searchExplanation?: string;
  enrichmentStatus: 'enriched';
}

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

export interface GitHubLinkStatus {
  state: 'open' | 'closed' | 'merged';
  title?: string;
  labels?: Array<{ name: string; color: string }>;
  assignees?: Array<{ login: string; avatar_url: string }>;
  projects?: Array<{
    name: string;
    status?: string;
  }>;
  reviewStatus?: 'approved' | 'changes_requested' | 'pending' | null;
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

export interface Email {
  id: string;
  threadId: string;
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
  starCount?: number;
  isArchived?: boolean;
  lastCheckedAt?: string | null;
  labels?: string[];
  lastTheirReplyAt?: string;
  lastMyReplyAt?: string;
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
 * Returns true when an email's priority is in a "calculating" state — either
 * explicitly flagged by the backend (isProcessingPriority=true) or when the
 * score is 0 with no breakdown, which indicates a failed/incomplete batch run.
 *
 * Use this instead of checking isProcessingPriority directly so the UI shows
 * "Calculating..." for emails stuck at score=0 after a failed prioritisation.
 */
export function isEmailPriorityCalculating(email: Email): boolean {
  if (email.isProcessingPriority) {
    return true;
  }
  const score = getEmailPriorityScore(email);
  const hasBreakdown =
    email.priorityExplanation?.breakdown != null &&
    email.priorityExplanation.breakdown.length > 0;
  return score === 0 && !hasBreakdown;
}
