/** Payload of a JOB_NAMES.FETCH_USER_EMAILS job. */
export interface FetchUserEmailsJobData {
  userId: string;
  /** Continuation jobs: process exactly these provider thread IDs instead of listing. */
  threadIds?: string[];
  isContinuation?: boolean;
  syncWindowHours?: number;
  /** Older mail the user asked to import — see SyncEmailsOptions.isBackfill. */
  isBackfill?: boolean;
}
