export interface FailedJob {
  id: string;
  userId?: string;
  emailId?: string;
  threadId?: string;
  error: string;
  createdAt: string;
  completedAt: string | null;
  retryCount: number;
  retryLimit: number;
}

export interface SilentFailure {
  threadId: string;
  links: string;
  lastAttempted: string;
}

export interface JobStats {
  created?: number;
  active?: number;
  retry?: number;
  failed?: number;
  completed?: number;
}

export interface GitHubDebugInfo {
  usersWithToken: number;
  threadsWithMetadata: number;
  threadsWithLinksNoStatus: number;
  jobStats: JobStats;
  recentFailedJobs: FailedJob[];
  recentSilentFailures: SilentFailure[];
  timestamp: string;
}

export interface TokenTestResult {
  hasToken: boolean;
  valid: boolean;
  login?: string;
  name?: string;
  scopes?: string[];
  error?: string;
  repoAccess?: boolean;
  repoIsPrivate?: boolean;
  repoError?: string;
}
