/** Shared shape for a single feedback submission, used in both FeedbackCard and FeedbackSection. */
export interface FeedbackItem {
  id: string;
  userEmail: string | null;
  message: string;
  screenshotS3Key: string | null;
  /** Presigned S3 GET URL for the screenshot (1-hour TTL). Null when no screenshot. */
  screenshotUrl: string | null;
  createdAt: string;
  appVersion: string | null;
  userAgent: string | null;
}
