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
  // Email attachments
  attachments?: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
  // Email category for grouping (e.g., Newsletters, Sales, Customer Support)
  category?: string | null;
  // Explanation of why this category was chosen (especially useful for "Other")
  categoryExplanation?: string | null;
  // Proto category name for emails in "Other" category
  protoCategoryName?: string | null;
  // Proto category description for emails in "Other" category
  protoCategoryDescription?: string | null;
  // Correspondent info for display (the other person in the conversation)
  correspondentEmail?: string | null;
  correspondentName?: string | null;
}

export interface TriageSuggestion {
  suggestedStarCount: number;
  suggestedArchive: boolean;
  confidence: number;
  reasoning: string;
}

export interface PriorityExplanation {
  score: number;
  dimensions: {
    urgency: { score: number; reasons: string[] };
    goalAlignment: { score: number; reasons: string[] };
    vipContact: { score: number; reasons: string[] };
  };
  breakdown: Array<{ factor: string; value: number; description: string }>;
}

export type InboxMode = 'triage' | 'action' | 'follow-up';

/**
 * Calculate priority score from breakdown array
 * This is the single source of truth for priority scores
 * @param email The email object with optional priorityExplanation
 * @returns The calculated score (can be negative), or 0 if no breakdown exists
 */
export function getEmailPriorityScore(email: Email): number {
  if (!email.priorityExplanation || !email.priorityExplanation.breakdown) {
    return 0;
  }

  const total = email.priorityExplanation.breakdown.reduce(
    (sum, item) => sum + (item.value || 0),
    0,
  );

  // Don't clamp - allow negative scores as breakdown can legitimately be negative
  // (e.g., low urgency = -12, low goal alignment = -5, etc.)
  return total;
}
