/**
 * API response hardening: re-decrypts fields that use encrypted column transformers
 * when TypeORM hydration leaks ciphertext (e.g. partial QueryBuilder selects).
 *
 * Audited read paths (partial QB / raw SQL) remain elsewhere; list endpoints that
 * return user-facing encrypted text now call these helpers after repository.find:
 * emails (thread + single GET), users/me, google/office365/zoho account lists,
 * summarization rules, user_contexts (GET /context, category name maps),
 * github_repo_mappings (GET/POST/PUT repo-mappings).
 */
import type { AppleMailAccount } from "../database/entities/apple-mail-account.entity";
import type { BlockedKeyword } from "../database/entities/blocked-keyword.entity";
import type { BlockedSender } from "../database/entities/blocked-sender.entity";
import type { Email } from "../database/entities/email.entity";
import type { GitHubRepoMapping } from "../database/entities/github-repo-mapping.entity";
import type { GoogleAccount } from "../database/entities/google-account.entity";
import type { Office365Account } from "../database/entities/office365-account.entity";
import type { SummarizationRule } from "../database/entities/summarization-rule.entity";
import type { User } from "../database/entities/user.entity";
import type { UserContext } from "../database/entities/user-context.entity";
import type { ZohoAccount } from "../database/entities/zoho-account.entity";
import { sanitizeEmailCategoriesCsv } from "../utils/github-email-categories.util";
import { EncryptionHelper } from "./encryption.helper";

/**
 * Re-applies AES-GCM decryption to entity fields that should already be decrypted
 * via TypeORM column transformers. When partial QueryBuilder selects or hydrator
 * edge cases leave ciphertext on the entity, this normalises values before JSON
 * responses — tryDecrypt is idempotent for plaintext (see EncryptionHelper).
 */
// Decrypt shorthand used across many field assignments in this module.
function decryptForUI(
  value: string | null | undefined,
): string | null | undefined {
  if (value == null || value === "") {
    return value;
  }
  return EncryptionHelper.tryDecrypt(value);
}

function fixEncryptedJsonField<T>(
  value: unknown,
  parse: (raw: string) => T,
): T {
  if (value == null) {
    return value as T;
  }
  if (typeof value !== "string") {
    return value as T;
  }
  const decrypted = EncryptionHelper.tryDecrypt(value);
  if (decrypted == null) {
    return value as T;
  }
  try {
    return parse(decrypted);
  } catch {
    return value as T;
  }
}

/**
 * Mutates the email in place for API serialization (not persisted).
 */
export function decryptEmailEntityForApi(email: Email): void {
  email.from = decryptForUI(email.from) as string;
  email.fromName = decryptForUI(email.fromName) as string | null;
  email.senderJobTitle = decryptForUI(email.senderJobTitle) as string | null;
  email.to = decryptForUI(email.to) as string | null;
  email.cc = decryptForUI(email.cc) as string | null;
  email.replyTo = decryptForUI(email.replyTo) as string | null;
  email.subject = decryptForUI(email.subject) as string;
  email.body = decryptForUI(email.body) as string;
  email.htmlBody = decryptForUI(email.htmlBody) as string | null;
  email.priorityOverrideReason = decryptForUI(email.priorityOverrideReason) as
    | string
    | null;
  email.summary = decryptForUI(email.summary) as string | null;

  if (email.labels != null && typeof email.labels === "string") {
    email.labels = fixEncryptedJsonField(email.labels, (raw) =>
      JSON.parse(raw),
    ) as string[];
  }
  if (email.attachments != null && typeof email.attachments === "string") {
    email.attachments = fixEncryptedJsonField(email.attachments, (raw) =>
      JSON.parse(raw),
    ) as Email["attachments"];
  }
  if (
    email.actionItemsJson != null &&
    typeof email.actionItemsJson === "string"
  ) {
    email.actionItemsJson = fixEncryptedJsonField(
      email.actionItemsJson,
      (raw) => JSON.parse(raw),
    ) as Email["actionItemsJson"];
  }
}

/**
 * Mutates the user in place for API serialization (not persisted).
 */
export function decryptUserEntityForApi(user: User): void {
  user.email = decryptForUI(user.email) as string;
  user.name = decryptForUI(user.name) as string | null;
  user.displayName = decryptForUI(user.displayName) as string | null;
  user.jobTitle = decryptForUI(user.jobTitle) as string | null;
  user.calendarBookingUrl = decryptForUI(user.calendarBookingUrl) as
    | string
    | null;
  user.emailSignature = decryptForUI(user.emailSignature) as string | null;
  user.googleCalendarAccessToken = decryptForUI(
    user.googleCalendarAccessToken,
  ) as string | null;
  user.googleCalendarRefreshToken = decryptForUI(
    user.googleCalendarRefreshToken,
  ) as string | null;
  user.openAiApiKey = decryptForUI(user.openAiApiKey) as string | null;
  user.githubToken = decryptForUI(user.githubToken) as string | null;
  user.anthropicApiKey = decryptForUI(user.anthropicApiKey) as string | null;

  if (user.toneSettings != null && typeof user.toneSettings === "string") {
    user.toneSettings = fixEncryptedJsonField(user.toneSettings, (raw) =>
      JSON.parse(raw),
    ) as User["toneSettings"];
  }
  if (
    user.autoResponderSettings != null &&
    typeof user.autoResponderSettings === "string"
  ) {
    user.autoResponderSettings = fixEncryptedJsonField(
      user.autoResponderSettings,
      (raw) => JSON.parse(raw),
    ) as User["autoResponderSettings"];
  }
}

export function decryptGoogleAccountEntityForApi(account: GoogleAccount): void {
  account.email = decryptForUI(account.email) as string;
  account.accessToken = decryptForUI(account.accessToken) as string;
  account.refreshToken = decryptForUI(account.refreshToken) as string;
}

export function decryptOffice365AccountEntityForApi(
  account: Office365Account,
): void {
  account.email = decryptForUI(account.email) as string;
  account.accessToken = decryptForUI(account.accessToken) as string;
  account.refreshToken = decryptForUI(account.refreshToken) as string;
}

export function decryptZohoAccountEntityForApi(account: ZohoAccount): void {
  account.email = decryptForUI(account.email) as string;
  account.accessToken = decryptForUI(account.accessToken) as string;
  account.refreshToken = decryptForUI(account.refreshToken) as string;
}

export function decryptAppleMailAccountEntityForApi(
  account: AppleMailAccount,
): void {
  account.email = decryptForUI(account.email) as string;
}

export function decryptSummarizationRuleEntityForApi(
  rule: SummarizationRule,
): void {
  rule.whenToUse = decryptForUI(rule.whenToUse) as string;
  rule.howToSummarize = decryptForUI(rule.howToSummarize) as string;
}

export function decryptGitHubRepoMappingEntityForApi(
  mapping: GitHubRepoMapping,
): void {
  mapping.owner = decryptForUI(mapping.owner) as string;
  mapping.repo = decryptForUI(mapping.repo) as string;
  mapping.emailCategories =
    mapping.emailCategories == null || mapping.emailCategories === ""
      ? mapping.emailCategories
      : sanitizeEmailCategoriesCsv(
          decryptForUI(mapping.emailCategories) as string,
        );
  mapping.context =
    mapping.context == null || mapping.context === ""
      ? mapping.context
      : (decryptForUI(mapping.context) as string);
}

export function decryptBlockedSenderEntityForApi(sender: BlockedSender): void {
  sender.email = decryptForUI(sender.email) as string;
  sender.senderName = decryptForUI(sender.senderName) as string | null;
  sender.reason = decryptForUI(sender.reason) as string | null;
}

export function decryptBlockedKeywordEntityForApi(
  keyword: BlockedKeyword,
): void {
  keyword.keyword = decryptForUI(keyword.keyword) as string;
  keyword.reason = decryptForUI(keyword.reason) as string | null;
}

/**
 * Mutates user_contexts row for API / category-name resolution.
 * Partial `find({ select: [...] })` on this entity skips column transformers.
 */
export function decryptUserContextEntityForApi(ctx: UserContext): void {
  ctx.contextValue = decryptForUI(ctx.contextValue) as string;
  if (ctx.explanation != null && ctx.explanation !== "") {
    ctx.explanation = decryptForUI(ctx.explanation) as string;
  }
}

/**
 * Hydrate a `user_contexts` row from raw SQL (transformers never run on `.query()`).
 * Matches TypeORM `simple-array` handling for `sourceThreadIds`.
 */
export function mapRawUserContextRowToApiEntity(
  row: Record<string, unknown>,
): UserContext {
  const rawIds = row.sourceThreadIds;
  let sourceThreadIds: string[] | undefined;
  if (rawIds == null || rawIds === "") {
    sourceThreadIds = [];
  } else if (Array.isArray(rawIds)) {
    sourceThreadIds = rawIds as string[];
  } else if (typeof rawIds === "string") {
    sourceThreadIds = rawIds.length > 0 ? rawIds.split(",") : [];
  } else {
    sourceThreadIds = [];
  }

  const ctx = {
    contextId: row.contextId as string,
    userId: row.userId as string,
    contextKey: row.contextKey as UserContext["contextKey"],
    contextValue: row.contextValue as string,
    categoryKey: (row.categoryKey as string | null) ?? null,
    priority: row.priority as number | null,
    source: row.source as UserContext["source"],
    explanation: row.explanation as string | null,
    sourceThreadIds,
    createdAt: row.createdAt as Date,
    lastModified: row.lastModified as Date,
    needsCategoryDedup: Boolean(row.needsCategoryDedup),
  } as UserContext;

  decryptUserContextEntityForApi(ctx);
  return ctx;
}
