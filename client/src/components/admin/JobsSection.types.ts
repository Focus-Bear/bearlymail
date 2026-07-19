export interface JobStat {
  jobType: string;
  queued: number;
  active: number;
  retry: number;
  failed: number;
  completed: number;
  avgCompletionTimeMs: number | null;
}

export interface JobStatsResponse {
  stats: JobStat[];
  timestamp: string;
}

export type DateRange = '24h' | '7d' | '30d' | 'all';
export type SortColumn = 'jobType' | 'queued' | 'active' | 'retry' | 'failed' | 'completed' | 'avgCompletionTimeMs';
export type SortDirection = 'asc' | 'desc';
