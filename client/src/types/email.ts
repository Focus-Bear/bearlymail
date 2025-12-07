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
  labels?: string[];
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

export type InboxMode = 'triage' | 'process';
