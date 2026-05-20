import { Email } from "../../database/entities/email.entity";

/**
 * Represents an email row returned by runInboxQuery — a joined projection
 * of the `emails` table and its parent `email_threads` row.
 * Thread-level fields are flattened onto the object rather than
 * being nested under a `.thread` relation.
 */
export interface InboxEmail extends Email {
  // Thread-level fields flattened from email_threads
  starCount: number;
  isArchived: boolean;
  urgencyScore: number | null;
  priorityScore: number | null;
  priorityExplanation: Record<string, unknown> | null;
  isProcessingPriority: boolean;
  githubMetadata: unknown;
  threadUpdatedAt: Date;
  category: string | null;
  categoryExplanation: string | null;
  categoryId: string | null;
  protoCategoryName: string | null;
  protoCategoryDescription: string | null;
  // Correspondent fields from lateral join
  correspondentEmail: string | null;
  correspondentName: string | null;
  // Follow-up metadata (populated by EmailFollowUpService)
  lastTheirReplyAt?: string;
  lastMyReplyAt?: string;
  /** ISO timestamp of when this thread's follow-up becomes due */
  followUpDueAt?: string;
}
