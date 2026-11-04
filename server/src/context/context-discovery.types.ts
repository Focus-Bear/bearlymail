import type {
  DiscoveredCategory,
  DiscoveredProject,
  DiscoveredVipContact,
  DiscoveryThreadStub,
} from "../llm/llm-discover-user-context";

/**
 * PgBoss payload for one slim-discovery batch (ANALYZE_CONTEXT_BATCH). Fully
 * self-contained: the orchestrator pre-builds the thread stubs so the worker
 * never touches the mail provider, and the existing category / VIP names ride
 * along so the prompt only proposes what is missing.
 */
export interface DiscoveryBatchJob {
  userId: string;
  analysisRecordId: string;
  batchIndex: number;
  totalBatches: number;
  threads: DiscoveryThreadStub[];
  userEmail?: string;
  existingCategories: string[];
  existingVipContacts: string[];
  /** Optional so batch jobs queued before projects were discovered still parse. */
  existingProjects?: string[];
}

/** Stored under `ContextAnalysis.stats.batchResults[batchIndex]` on success. */
export interface DiscoveryBatchResult {
  categories: DiscoveredCategory[];
  vipContacts: DiscoveredVipContact[];
  /** Optional so results stored before projects were discovered still merge. */
  projects?: DiscoveredProject[];
  urgentHints: string[];
  notUrgentHints: string[];
  threadIds: string[];
  completedAt: string;
}

/** Stored under `ContextAnalysis.stats.batchResults[batchIndex]` on failure. */
export interface DiscoveryBatchFailure {
  error: string;
  failedAt: string;
  correlationId: string;
  errorType: string;
}

export type StoredBatchResult = DiscoveryBatchResult | DiscoveryBatchFailure;

export function isDiscoveryBatchFailure(
  result: StoredBatchResult | undefined,
): result is DiscoveryBatchFailure {
  return !!result && "error" in result;
}

export function buildDiscoveryBatchSingletonKey(
  analysisRecordId: string,
  batchIndex: number,
): string {
  return `analyze-context-batch-${analysisRecordId}-${batchIndex}`;
}
