import type { AiDecisionProvider } from "../../constants/ai-decision-provider.constants";
import type { PriorityScoreSource } from "../../constants/priority-rule.constants";
import { Email } from "../../database/entities/email.entity";
import { CategorizationSourceKind } from "../category-source.helper";

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
  /**
   * True when the user chose "I still need to take action" on their last reply,
   * pinning the thread to Action mode even though they sent the last message.
   * Keeps the Action↔Follow-Up split from dropping the thread into Follow-Up.
   */
  keepInAction: boolean;
  githubMetadata: unknown;
  threadUpdatedAt: Date;
  category: string | null;
  categoryExplanation: string | null;
  categoryId: string | null;
  /**
   * True while the thread has no category yet and categorisation is still
   * running — the client shows it under "AI deciding category" instead of Other.
   */
  isCategoryPending: boolean;
  /** Which process assigned the category, for the everyday "Categorised by" line. */
  categorizationSource: CategorizationSourceKind | null;
  /** AI engine behind an "ai" categorizationSource (e.g. "gemini", "jev"); null otherwise or when unknown. */
  categorizationProvider: AiDecisionProvider | null;
  /** How priorityScore was set ("llm" / "rule" / "local"), for the "Priority scored by" line. */
  prioritySource: PriorityScoreSource | null;
  /** AI engine behind an "llm" prioritySource; null otherwise or when unknown. */
  priorityProvider: AiDecisionProvider | null;
  /** Proto-category the thread was bucketed under, so the client can promote it by ID. */
  protoCategoryId: string | null;
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
