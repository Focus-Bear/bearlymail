export const ERROR_MESSAGES = {
  EMAIL_NOT_FOUND: "Email not found",
  USER_NOT_FOUND: "User not found",
  THREAD_NOT_FOUND: "Thread not found",
  CONTACT_NOT_FOUND: "Contact not found",
  DEAL_NOT_FOUND: "Deal not found",
  FOLLOW_UP_NOT_FOUND: "Follow-up not found",
  GOOGLE_ACCOUNT_NOT_FOUND: "Google account not found",
  OFFICE365_ACCOUNT_NOT_FOUND: "Office 365 account not found",
  ZOHO_ACCOUNT_NOT_FOUND: "Zoho account not found",
  NOT_CONNECTED_TO_GMAIL: "User not connected to Gmail",
  GOOGLE_CALENDAR_NOT_CONNECTED: "Google Calendar not connected",
  GITHUB_TOKEN_NOT_CONFIGURED: "GitHub token not configured",
  GITHUB_TOKEN_INVALID: "GitHub token is invalid or expired",
  GITHUB_TOKEN_MISSING_PROJECT_SCOPE:
    "Your GitHub connection is missing the 'project' permission required to update project status. Please reconnect your GitHub account in Settings to grant the updated access.",
  REFRESH_TOKEN_MISSING: "Refresh token missing - please log in again",
  GMAIL_ACCESS_TOKEN_MISSING:
    "Gmail access token missing - please log in again",
  NO_EMAIL_PROVIDER: "No email provider connected",
  CUSTOM_FIELD_NOT_FOUND: "Custom field not found",
  FAILED_TO_SEND_REPLY: "Failed to send reply",
  FAILED_TO_SEND_EMAIL: "Failed to send email",
  GMAIL_RECONNECT_REQUIRED:
    "Gmail authorisation has expired. Please reconnect your account.",
} as const;

export type ErrorMessage = (typeof ERROR_MESSAGES)[keyof typeof ERROR_MESSAGES];
