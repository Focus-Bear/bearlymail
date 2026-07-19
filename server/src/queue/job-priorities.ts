import { JOB_NAMES, JobName } from "../constants/job-names";

/**
 * Job Priority Constants
 *
 * PgBoss uses priority values from 1-100, where higher numbers = higher priority.
 * Jobs are processed in priority order (higher priority first).
 */

export enum JobPriority {
  // High Priority: User-triggered actions that need immediate processing
  HIGH = 80,

  // Medium-High Priority: Important background processing
  MEDIUM_HIGH = 60,

  // Medium Priority: Standard background processing
  MEDIUM = 40,

  // Low Priority: Non-critical background jobs
  LOW = 20,

  // Very Low Priority: Learning and analysis jobs that can wait
  VERY_LOW = 10,
}

/**
 * Priority assignments for different job types
 */
export const JobTypePriority: Partial<Record<JobName, JobPriority>> = {
  [JOB_NAMES.FETCH_USER_EMAILS]: JobPriority.HIGH,
  [JOB_NAMES.SCHEDULE_EMAIL_FETCH_JOBS]: JobPriority.MEDIUM,
  [JOB_NAMES.SYNC_EMAILS]: JobPriority.HIGH,
  [JOB_NAMES.REFINE_PRIORITY]: JobPriority.HIGH,
  [JOB_NAMES.REFINE_PRIORITY_BACKGROUND]: JobPriority.MEDIUM,
  [JOB_NAMES.REFINE_PRIORITY_BATCH]: JobPriority.MEDIUM_HIGH,
  [JOB_NAMES.GENERATE_SUMMARY]: JobPriority.HIGH,
  [JOB_NAMES.GENERATE_SUMMARY_BACKGROUND]: JobPriority.MEDIUM,
  [JOB_NAMES.SCAN_HISTORY]: JobPriority.MEDIUM,
  [JOB_NAMES.SCAN_HISTORY_EMAIL]: JobPriority.MEDIUM,
  [JOB_NAMES.ANALYZE_SCAN_RESULTS]: JobPriority.LOW,
  [JOB_NAMES.ANALYZE_CONTEXT]: JobPriority.LOW,
  [JOB_NAMES.ANALYZE_CONTEXT_BATCH]: JobPriority.LOW,
  [JOB_NAMES.FINALIZE_CONTEXT_ANALYSIS]: JobPriority.LOW,
  [JOB_NAMES.CONSOLIDATE_CATEGORIES]: JobPriority.MEDIUM,
  [JOB_NAMES.LEARN_FROM_STAR]: JobPriority.VERY_LOW,
  [JOB_NAMES.LEARN_QA_FROM_SENT]: JobPriority.VERY_LOW,
  [JOB_NAMES.SYNC_GMAIL]: JobPriority.MEDIUM,
  [JOB_NAMES.AUTO_RESPONDER]: JobPriority.LOW,
  [JOB_NAMES.GENERATE_SUGGESTED_REPLIES]: JobPriority.LOW,
  [JOB_NAMES.ARCHIVE_EMAIL_PROVIDER_SYNC]: JobPriority.HIGH,
  [JOB_NAMES.SYNC_CONTACTS]: JobPriority.LOW,
  [JOB_NAMES.SCHEDULE_CONTACT_SYNC_JOBS]: JobPriority.LOW,
  [JOB_NAMES.EVALUATE_WORKFLOWS]: JobPriority.LOW,
  [JOB_NAMES.REENCRYPT_USER_DATA]: JobPriority.VERY_LOW,
  // User-triggered and the user is actively waiting on the download.
  [JOB_NAMES.EXPORT_EMAILS]: JobPriority.MEDIUM_HIGH,
  // Background, off-peak data feed for the local-model trainer.
  [JOB_NAMES.SCHEDULE_TRAINING_DATA_EXPORT]: JobPriority.VERY_LOW,
  [JOB_NAMES.EXPORT_TRAINING_DATA]: JobPriority.VERY_LOW,
};

/**
 * Get priority for a job type
 * @param jobType The job type name
 * @param isUserTriggered Whether this job was triggered by a user action
 * @returns Priority value (1-100)
 */
export function getJobPriority(
  jobType: JobName | string,
  isUserTriggered: boolean = false,
): number {
  if (isUserTriggered) {
    if (
      jobType === JOB_NAMES.REFINE_PRIORITY ||
      jobType === JOB_NAMES.GENERATE_SUMMARY
    ) {
      return JobPriority.HIGH;
    }
    if (
      jobType === JOB_NAMES.FETCH_USER_EMAILS ||
      jobType === JOB_NAMES.SYNC_EMAILS
    ) {
      return JobPriority.HIGH;
    }
    if (jobType === JOB_NAMES.ANALYZE_CONTEXT) {
      return JobPriority.MEDIUM_HIGH;
    }
  }

  const priority = JobTypePriority[jobType as JobName];
  if (priority !== undefined) {
    return priority;
  }

  return JobPriority.MEDIUM;
}
