/**
 * Domain type constants for server-side comparisons.
 * Use these instead of inline magic string literals.
 * Part of issue #1095 (eliminate magic strings across the codebase — Phase 3).
 */

export const GITHUB_ACTION_TYPES = {
  UPDATE_STATUS: "github_update_status",
  ADD_COMMENT: "github_add_comment",
  CREATE_ISSUE: "github_create_issue",
} as const;

export type GithubActionType =
  (typeof GITHUB_ACTION_TYPES)[keyof typeof GITHUB_ACTION_TYPES];

export const GITHUB_LINK_TYPES = {
  ISSUE: "issue",
  PR: "pr",
  PULL: "pull",
} as const;

export type GithubLinkType =
  (typeof GITHUB_LINK_TYPES)[keyof typeof GITHUB_LINK_TYPES];

export const WORKFLOW_STEP_TYPES = {
  REPLY: "reply",
  MCP_TOOL: "mcp_tool",
  WEBHOOK: "webhook",
  ARCHIVE: "archive",
} as const;

export type WorkflowStepType =
  (typeof WORKFLOW_STEP_TYPES)[keyof typeof WORKFLOW_STEP_TYPES];

export const ACTION_ITEM_TYPES = {
  SCHEDULING_REQUEST: "scheduling_request",
} as const;

export type ActionItemType =
  (typeof ACTION_ITEM_TYPES)[keyof typeof ACTION_ITEM_TYPES];

export const DATA_IMPORT_MERGE_MODES = {
  REPLACE: "replace",
  MERGE: "merge",
} as const;

export type DataImportMergeMode =
  (typeof DATA_IMPORT_MERGE_MODES)[keyof typeof DATA_IMPORT_MERGE_MODES];

export const LLM_PROVIDER_STRINGS = {
  GEMINI: "gemini",
} as const;

/** Connected email account provider types. */
export const EMAIL_PROVIDER_TYPES = {
  GMAIL: "gmail",
  OFFICE365: "office365",
  ZOHO: "zoho",
} as const;

export type EmailProviderType =
  (typeof EMAIL_PROVIDER_TYPES)[keyof typeof EMAIL_PROVIDER_TYPES];

export type LlmProviderString =
  (typeof LLM_PROVIDER_STRINGS)[keyof typeof LLM_PROVIDER_STRINGS];

export const CATEGORY_RULE_MATCH_MODES = {
  SENDER_DOMAIN_AND_SUBJECT_PREFIX: "sender_domain_and_subject_prefix",
  COMPOSITE: "composite",
} as const;

export type CategoryRuleMatchMode =
  (typeof CATEGORY_RULE_MATCH_MODES)[keyof typeof CATEGORY_RULE_MATCH_MODES];

export const CONTENT_TYPES = {
  HTML: "html",
} as const;

export type ContentType = (typeof CONTENT_TYPES)[keyof typeof CONTENT_TYPES];

export const EMAIL_IMPORTANCE = {
  HIGH: "high",
  LOW: "low",
  NORMAL: "normal",
} as const;

export type EmailImportance =
  (typeof EMAIL_IMPORTANCE)[keyof typeof EMAIL_IMPORTANCE];

export const TONE_STYLES = {
  CASUAL: "casual",
  FORMAL: "formal",
} as const;

export type ToneStyle = (typeof TONE_STYLES)[keyof typeof TONE_STYLES];

export const ANALYSIS_PROGRESS_STAGES = {
  STARTING: "starting",
  FETCHING: "fetching",
  ANALYZING: "analyzing",
  SUMMARIZING: "summarizing",
  COMPLETE: "complete",
} as const;

export type AnalysisProgressStage =
  (typeof ANALYSIS_PROGRESS_STAGES)[keyof typeof ANALYSIS_PROGRESS_STAGES];

export const LOG_LEVELS = {
  ERROR: "error",
  WARN: "warn",
  DEBUG: "debug",
  LOG: "log",
  VERBOSE: "verbose",
} as const;

export type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];

export const AUTO_RESPONDER_TEMPLATE_TYPES = {
  STANDARD: "standard",
  HIGH_PRIORITY: "highPriority",
  LOW_PRIORITY: "lowPriority",
  ZERO_BACKLOG: "zeroBacklog",
} as const;

export type AutoResponderTemplateType =
  (typeof AUTO_RESPONDER_TEMPLATE_TYPES)[keyof typeof AUTO_RESPONDER_TEMPLATE_TYPES];

export const SCHEDULED_EMAIL_TYPES = {
  REPLY: "reply",
  FORWARD: "forward",
  NEW: "new",
} as const;

export type ScheduledEmailType =
  (typeof SCHEDULED_EMAIL_TYPES)[keyof typeof SCHEDULED_EMAIL_TYPES];

export const PRIORITY_LEVELS = {
  VERY_HIGH: "veryHigh",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  VERY_LOW: "veryLow",
} as const;

export type PriorityLevel =
  (typeof PRIORITY_LEVELS)[keyof typeof PRIORITY_LEVELS];

export const SYNC_STATUS_EXTENDED = {
  UNSYNCED: "unsynced",
  SYNCED: "synced",
} as const;

export const EMAIL_MODES = {
  ACTION: "action",
  FOLLOW_UP: "follow-up",
  TRIAGE: "triage",
} as const;

export type EmailMode = (typeof EMAIL_MODES)[keyof typeof EMAIL_MODES];

export const PERFORMANCE_OPERATIONS = {
  PRIORITY_EXPLANATION: "priority-explanation",
  SEARCH_RELEVANCE_EXPLANATIONS: "search-relevance-explanations",
} as const;

export type PerformanceOperation =
  (typeof PERFORMANCE_OPERATIONS)[keyof typeof PERFORMANCE_OPERATIONS];

export const OFFICE365_FOLDER_IDS = {
  INBOX: "inbox",
  DELETED_ITEMS: "deleteditems",
  SENT_ITEMS: "sentitems",
  DRAFTS: "drafts",
} as const;

export type Office365FolderId =
  (typeof OFFICE365_FOLDER_IDS)[keyof typeof OFFICE365_FOLDER_IDS];

export const ZOHO_FOLDER_IDS = {
  INBOX: "inbox",
  TRASH: "trash",
  SENT: "sent",
  DRAFTS: "drafts",
} as const;

export type ZohoFolderId =
  (typeof ZOHO_FOLDER_IDS)[keyof typeof ZOHO_FOLDER_IDS];

export const CATEGORY_RULE_KINDS = {
  LEGACY: "legacy",
  COMPOSITE: "composite",
} as const;

export type CategoryRuleKind =
  (typeof CATEGORY_RULE_KINDS)[keyof typeof CATEGORY_RULE_KINDS];

export const CATEGORY_RULE_TYPES = {
  EXACT_SENDER: "exact_sender",
  SENDER_DOMAIN: "sender_domain",
  SUBJECT_PREFIX: "subject_prefix",
  SENDER_DOMAIN_AND_SUBJECT_PREFIX: "sender_domain_and_subject_prefix",
} as const;

export type CategoryRuleType =
  (typeof CATEGORY_RULE_TYPES)[keyof typeof CATEGORY_RULE_TYPES];

export const PHISHING_CONFIDENCE = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export type PhishingConfidence =
  (typeof PHISHING_CONFIDENCE)[keyof typeof PHISHING_CONFIDENCE];

export const AUTH_ACTION_TYPES = {
  CONNECT: "connect",
  DISCONNECT: "disconnect",
} as const;

export type AuthActionType =
  (typeof AUTH_ACTION_TYPES)[keyof typeof AUTH_ACTION_TYPES];

export const GITHUB_FIELD_NAMES = {
  STATUS: "status",
  TITLE: "title",
} as const;

export type GithubFieldName =
  (typeof GITHUB_FIELD_NAMES)[keyof typeof GITHUB_FIELD_NAMES];

export const UPLOAD_FIELD_NAMES = {
  FILES: "files",
  INLINE_IMAGES: "inlineImages",
} as const;

export type UploadFieldName =
  (typeof UPLOAD_FIELD_NAMES)[keyof typeof UPLOAD_FIELD_NAMES];

export const LLM_BLOCK_TYPES = {
  TEXT: "text",
  IMAGE: "image",
  TOOL_USE: "tool_use",
  TOOL_RESULT: "tool_result",
} as const;

export type LlmBlockType =
  (typeof LLM_BLOCK_TYPES)[keyof typeof LLM_BLOCK_TYPES];

export const CATEGORY_RESERVED_NAMES = {
  OTHER: "other",
} as const;

export type CategoryReservedName =
  (typeof CATEGORY_RESERVED_NAMES)[keyof typeof CATEGORY_RESERVED_NAMES];

export const DEFAULT_CATEGORY_NAMES = {
  NEWSLETTERS: "Newsletters",
} as const;

export type DefaultCategoryName =
  (typeof DEFAULT_CATEGORY_NAMES)[keyof typeof DEFAULT_CATEGORY_NAMES];

export const PRIORITY_LEARNING_REASONS = {
  WRONG_SENDER_PRIORITY: "wrong_sender_priority",
  TOPIC_MISMATCH: "topic_mismatch",
} as const;

export type PriorityLearningReason =
  (typeof PRIORITY_LEARNING_REASONS)[keyof typeof PRIORITY_LEARNING_REASONS];

export const AUTO_REPLY_VALUES = {
  AUTO_REPLIED: "auto-replied",
  AUTO_GENERATED: "auto-generated",
} as const;

export type AutoReplyValue =
  (typeof AUTO_REPLY_VALUES)[keyof typeof AUTO_REPLY_VALUES];

export const INBOX_FILTER_VALUES = {
  UNASSIGNED: "unassigned",
} as const;

export type InboxFilterValue =
  (typeof INBOX_FILTER_VALUES)[keyof typeof INBOX_FILTER_VALUES];

export const ICS_DATE_TYPES = {
  DATE: "date",
  DATE_TIME: "date-time",
} as const;

export type IcsDateType = (typeof ICS_DATE_TYPES)[keyof typeof ICS_DATE_TYPES];

export const TEMPLATE_PART_TYPES = {
  LITERAL: "literal",
  ELEMENT: "element",
} as const;

export type TemplatePartType =
  (typeof TEMPLATE_PART_TYPES)[keyof typeof TEMPLATE_PART_TYPES];

export const NODE_ENV_VALUES = {
  PRODUCTION: "production",
  DEVELOPMENT: "development",
  TEST: "test",
} as const;

export type NodeEnvValue =
  (typeof NODE_ENV_VALUES)[keyof typeof NODE_ENV_VALUES];

export const BOOLEAN_STRING_VALUES = {
  TRUE: "true",
  FALSE: "false",
} as const;

export type BooleanStringValue =
  (typeof BOOLEAN_STRING_VALUES)[keyof typeof BOOLEAN_STRING_VALUES];

export const OAUTH_ERROR_CODES = {
  INVALID_GRANT: "invalid_grant",
  INVALID_TOKEN: "invalid_token",
} as const;

export type OAuthErrorCode =
  (typeof OAUTH_ERROR_CODES)[keyof typeof OAUTH_ERROR_CODES];

export const LOCALHOST_VALUES = {
  LOCALHOST: "localhost",
  LOCALHOST_IP: "127.0.0.1",
} as const;
