export interface FailureDetail {
  batchIndex: number;
  error: string;
  failedAt: string | null;
  correlationId: string | null;
  errorType: string | null;
}

export interface ContextAnalysisItem {
  id: string;
  correlationId: string | null;
  userId: string;
  userEmail: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  errorMessage: string | null;
  progress: number | null;
  threadCount: number | null;
  analyzedCount: number | null;
  totalBatches: number;
  completedBatches: number;
  failedBatches: number;
  failureDetails: FailureDetail[];
  createdAt: string;
  updatedAt: string;
}

export interface ContextAnalysisResponse {
  analyses: ContextAnalysisItem[];
  timestamp: string;
}

export type StatusFilter = 'all' | 'failed' | 'running' | 'completed' | 'pending';
