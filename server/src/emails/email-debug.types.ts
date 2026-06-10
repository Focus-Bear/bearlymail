import type { GmailLookupAttempt } from "./providers/gmail/gmail-lookup";

export interface ThreadLookupResult {
  found: boolean;
  threadId: string;
  thread: {
    id: string;
    threadId: string;
    starCount: number;
    isArchived: boolean;
    priorityScore: number | null;
    updatedAt: Date;
    batchDecisionReason: string | null;
    wasDeliveredEarly: boolean;
  } | null;
  emails: Array<{
    id: string;
    subject: string;
    from: string;
    receivedAt: Date;
    isSnoozed: boolean;
    snoozeUntil: Date | null;
    isBatched: boolean;
    batchReleaseAt: Date | null;
  }>;
  visibility: {
    wouldShowInTriage: boolean;
    wouldShowInAction: boolean;
    wouldShowInFollowUp: boolean;
  };
  reasons: string[];
}

export interface GmailApiResolveResult {
  foundInGmailApi: boolean;
  apiMessageId: string | null;
  apiThreadId: string | null;
  subject: string | null;
  from: string | null;
  receivedAt: string | null;
  connectedEmail: string | null;
  idsTried: string[];
  attempts: GmailLookupAttempt[];
  error?: string;
}
