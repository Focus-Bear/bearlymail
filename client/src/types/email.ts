export interface GitHubLinkStatus {
  state: 'open' | 'closed' | 'merged';
  title?: string;
  labels?: Array<{ name: string; color: string }>;
  assignees?: Array<{ login: string; avatar_url: string }>;
  project?: string;
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
  subject: string;
  body?: string;
  priorityScore: number;
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
  githubMetadata?: {
    links: GitHubLink[];
  };
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
