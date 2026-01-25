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
export const JobTypePriority = {
  // User-triggered email fetches (manual sync from UI)
  "fetch-user-emails": JobPriority.HIGH,

  // Scheduled email fetch job coordinator (cron job)
  "schedule-email-fetch-jobs": JobPriority.MEDIUM,

  // Legacy: keep for backwards compatibility
  "sync-emails": JobPriority.HIGH,

  // User-triggered priority refinement (for visible emails)
  "refine-priority": JobPriority.HIGH,

  // Background priority refinement (for new emails)
  "refine-priority-background": JobPriority.MEDIUM,

  // User-triggered summary generation
  "generate-summary": JobPriority.HIGH,

  // Background summary generation
  "generate-summary-background": JobPriority.MEDIUM,

  // Historical scan (onboarding)
  "scan-history": JobPriority.MEDIUM,

  // Individual email scan processing
  "scan-history-email": JobPriority.MEDIUM,

  // Scan analysis
  "analyze-scan-results": JobPriority.LOW,

  // Context analysis
  "analyze-context": JobPriority.LOW,

  // Batch email analysis (part of context analysis)
  "analyze-context-batch": JobPriority.LOW,

  // Finalize context analysis (post-processing after batches complete)
  "finalize-context-analysis": JobPriority.LOW,

  // Learning from user actions
  "learn-from-star": JobPriority.VERY_LOW,

  // Legacy sync job
  "sync-gmail": JobPriority.MEDIUM,

  // Auto-responder (after triage completion)
  "auto-responder": JobPriority.LOW,

  // Background suggested reply generation
  "generate-suggested-replies": JobPriority.LOW,
} as const;

/**
 * Get priority for a job type
 * @param jobType The job type name
 * @param isUserTriggered Whether this job was triggered by a user action
 * @returns Priority value (1-100)
 */
export function getJobPriority(
  jobType: string,
  isUserTriggered: boolean = false,
): number {
  // User-triggered jobs get higher priority
  if (isUserTriggered) {
    if (jobType === "refine-priority" || jobType === "generate-summary") {
      return JobPriority.HIGH;
    }
    if (jobType === "fetch-user-emails" || jobType === "sync-emails") {
      return JobPriority.HIGH;
    }
    if (jobType === "analyze-context") {
      return JobPriority.MEDIUM_HIGH;
    }
  }

  // Check if we have a specific priority for this job type
  const priority = JobTypePriority[jobType as keyof typeof JobTypePriority];
  if (priority !== undefined) {
    return priority;
  }

  // Default to medium priority
  return JobPriority.MEDIUM;
}
