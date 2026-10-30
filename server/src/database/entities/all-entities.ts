/**
 * Every TypeORM entity, listed explicitly. The Nest app loads entities through
 * `autoLoadEntities`, which needs Nest's module scan; the prioritisation Lambda
 * builds a plain DataSource and needs the full list (relations reference each
 * other, so a partial list fails at startup). Kept complete by all-entities.spec.ts.
 */
import { ActionItem } from "./action-item.entity";
import { AppleMailAccount } from "./apple-mail-account.entity";
import { AppleMailMessageRef } from "./apple-mail-message-ref.entity";
import { AuditLog } from "./audit-log.entity";
import { AutoArchiveProposal } from "./auto-archive-proposal.entity";
import { AutoArchiveScanState } from "./auto-archive-scan-state.entity";
import { AutoResponseLog } from "./auto-response-log.entity";
import { AutoResponseSuppression } from "./auto-response-suppression.entity";
import { BatchSchedule } from "./batch-schedule.entity";
import { BlockedKeyword } from "./blocked-keyword.entity";
import { BlockedSender } from "./blocked-sender.entity";
import { CalendarBooking } from "./calendar-booking.entity";
import { CategoryArchiveStat } from "./category-archive-stat.entity";
import { CategoryConsolidationRun } from "./category-consolidation-run.entity";
import { CategoryFamily } from "./category-family.entity";
import { CategoryOverride } from "./category-override.entity";
import { CategoryRule } from "./category-rule.entity";
import { Contact } from "./contact.entity";
import { ContactCustomField } from "./contact-custom-field.entity";
import { ContactCustomFieldValue } from "./contact-custom-field-value.entity";
import { ContactGroup } from "./contact-group.entity";
import { ContactGroupMember } from "./contact-group-member.entity";
import { ContactNote } from "./contact-note.entity";
import { ContactType } from "./contact-type.entity";
import { ContextAnalysis } from "./context-analysis.entity";
import { Deal } from "./deal.entity";
import { DealStage } from "./deal-stage.entity";
import { DebugConfig } from "./debug-config.entity";
import { DebugData } from "./debug-data.entity";
import { DeletedAccount } from "./deleted-account.entity";
import { Email } from "./email.entity";
import { EmailExport } from "./email-export.entity";
import { EmailOpenEvent } from "./email-open-event.entity";
import { EmailSendAttempt } from "./email-send-attempt.entity";
import { EmailThread } from "./email-thread.entity";
import { EmailTracking } from "./email-tracking.entity";
import { Feedback } from "./feedback.entity";
import { FollowUp } from "./follow-up.entity";
import { GitHubRepoMapping } from "./github-repo-mapping.entity";
import { GoogleAccount } from "./google-account.entity";
import { ImapAccount } from "./imap-account.entity";
import { LocalModelSupervision } from "./local-model-supervision.entity";
import { MCPSenderContextCache } from "./mcp-sender-context-cache.entity";
import { MCPServerConfig } from "./mcp-server-config.entity";
import { Office365Account } from "./office365-account.entity";
import { Organization } from "./organization.entity";
import { OrganizationMember } from "./organization-member.entity";
import { PriorityAnalysisRun } from "./priority-analysis-run.entity";
import { PriorityOverride } from "./priority-override.entity";
import { PriorityRule } from "./priority-rule.entity";
import { PrivateNote } from "./private-note.entity";
import { PromptExampleEntity } from "./prompt-example.entity";
import { ProtoCategory } from "./proto-category.entity";
import { ReplyDraft } from "./reply-draft.entity";
import { ScanEmail } from "./scan-email.entity";
import { ScheduledEmail } from "./scheduled-email.entity";
import { SchedulingPreference } from "./scheduling-preference.entity";
import { SuggestedReply } from "./suggested-reply.entity";
import { SummarizationRule } from "./summarization-rule.entity";
import { SyncHistoryLog } from "./sync-history-log.entity";
import { TokenUsage } from "./token-usage.entity";
import { User } from "./user.entity";
import { UserContext } from "./user-context.entity";
import { Waitlist } from "./waitlist.entity";
import { WorkflowExecutionLog } from "./workflow-execution-log.entity";
import { WorkflowRule } from "./workflow-rule.entity";
import { ZohoAccount } from "./zoho-account.entity";

export const ALL_ENTITIES = [
  ActionItem,
  AppleMailAccount,
  AppleMailMessageRef,
  AuditLog,
  AutoArchiveProposal,
  AutoArchiveScanState,
  AutoResponseLog,
  AutoResponseSuppression,
  BatchSchedule,
  BlockedKeyword,
  BlockedSender,
  CalendarBooking,
  CategoryArchiveStat,
  CategoryConsolidationRun,
  CategoryFamily,
  CategoryOverride,
  CategoryRule,
  Contact,
  ContactCustomField,
  ContactCustomFieldValue,
  ContactGroup,
  ContactGroupMember,
  ContactNote,
  ContactType,
  ContextAnalysis,
  Deal,
  DealStage,
  DebugConfig,
  DebugData,
  DeletedAccount,
  Email,
  EmailExport,
  EmailOpenEvent,
  EmailSendAttempt,
  EmailThread,
  EmailTracking,
  Feedback,
  FollowUp,
  GitHubRepoMapping,
  GoogleAccount,
  ImapAccount,
  LocalModelSupervision,
  MCPSenderContextCache,
  MCPServerConfig,
  Office365Account,
  Organization,
  OrganizationMember,
  PriorityAnalysisRun,
  PriorityOverride,
  PriorityRule,
  PrivateNote,
  PromptExampleEntity,
  ProtoCategory,
  ReplyDraft,
  ScanEmail,
  ScheduledEmail,
  SchedulingPreference,
  SuggestedReply,
  SummarizationRule,
  SyncHistoryLog,
  TokenUsage,
  User,
  UserContext,
  Waitlist,
  WorkflowExecutionLog,
  WorkflowRule,
  ZohoAccount,
];
