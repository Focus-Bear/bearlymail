/**
 * Domain status constants for server-side comparisons.
 * Use these instead of inline magic string literals.
 * Part of issue #1095 (eliminate magic strings across the codebase — Phase 3).
 */

export const SUBSCRIPTION_STATUS = {
  ACTIVE: "active",
  TRIAL: "trial",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
} as const;

export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

/**
 * Organisation-level plan state (Organization.planStatus).
 * New orgs start on a time-boxed trial; RevenueCat webhooks flip orgs to
 * active on purchase and to expired on cancellation/expiration; an elapsed
 * trial is lazily expired on read/metering paths.
 */
export const ORG_PLAN_STATUS = {
  UNPAID: "unpaid",
  TRIAL: "trial",
  ACTIVE: "active",
  EXPIRED: "expired",
} as const;

export type OrgPlanStatus =
  (typeof ORG_PLAN_STATUS)[keyof typeof ORG_PLAN_STATUS];

export const SYNC_STATUS = {
  UNSYNCED: "unsynced",
  SYNCED: "synced",
} as const;

export type SyncStatus = (typeof SYNC_STATUS)[keyof typeof SYNC_STATUS];

export const CONTEXT_ANALYSIS_STATUS = {
  RUNNING: "running",
  PENDING: "pending",
  FAILED: "failed",
  COMPLETED: "completed",
} as const;

export type ContextAnalysisStatus =
  (typeof CONTEXT_ANALYSIS_STATUS)[keyof typeof CONTEXT_ANALYSIS_STATUS];

export const EMAIL_EXPORT_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type EmailExportStatus =
  (typeof EMAIL_EXPORT_STATUS)[keyof typeof EMAIL_EXPORT_STATUS];

export const FOLLOW_UP_GENERATION_STATUS = {
  GENERATING: "generating",
} as const;

export type FollowUpGenerationStatus =
  (typeof FOLLOW_UP_GENERATION_STATUS)[keyof typeof FOLLOW_UP_GENERATION_STATUS];

export const BOOKING_STATUS = {
  CANCELLED: "cancelled",
} as const;

export type BookingStatus =
  (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS];

export const WORKFLOW_RESULT_STATUS = {
  SUCCESS: "success",
} as const;

export type WorkflowResultStatus =
  (typeof WORKFLOW_RESULT_STATUS)[keyof typeof WORKFLOW_RESULT_STATUS];

export const QUEUE_JOB_STATE = {
  CREATED: "created",
  ACTIVE: "active",
  RETRY: "retry",
  FAILED: "failed",
  COMPLETED: "completed",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
} as const;

export type QueueJobState =
  (typeof QUEUE_JOB_STATE)[keyof typeof QUEUE_JOB_STATE];

export const TONE_VALIDATION_STATUS = {
  REJECTED: "rejected",
  VALID: "valid",
} as const;

export type ToneValidationStatus =
  (typeof TONE_VALIDATION_STATUS)[keyof typeof TONE_VALIDATION_STATUS];

export const SCHEDULED_EMAIL_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type ScheduledEmailStatus =
  (typeof SCHEDULED_EMAIL_STATUS)[keyof typeof SCHEDULED_EMAIL_STATUS];

export const PROMISE_STATUS = {
  FULFILLED: "fulfilled",
  REJECTED: "rejected",
} as const;

export const CALENDAR_ENTRY_POINT_TYPES = {
  VIDEO: "video",
  PHONE: "phone",
  SIPADDRESS: "sipAddress",
  MORE: "more",
} as const;

export type CalendarEntryPointType =
  (typeof CALENDAR_ENTRY_POINT_TYPES)[keyof typeof CALENDAR_ENTRY_POINT_TYPES];
