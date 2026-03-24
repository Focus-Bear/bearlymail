/**
 * Shared types, constants, and pure helper functions for EmailInboxService.
 * Extracted to keep email-inbox.service.ts under the 800-line limit.
 */

import { INBOX_MODES } from "../constants/query-limits";
import { EncryptionHelper } from "../encryption/encryption.helper";

export const BLOCKED_MODE_THREAD_FILTER = `AND thread."isArchived" = true`;

/**
 * Returns the SQL WHERE fragment for thread filtering based on inbox mode.
 */
export function buildThreadFilter(mode: string): string {
  if (mode === INBOX_MODES.TRIAGE)
    return 'AND thread."isArchived" = false AND thread."starCount" = 0';
  if (mode === INBOX_MODES.ACTION || mode === INBOX_MODES.FOLLOW_UP)
    return 'AND thread."isArchived" = false AND thread."starCount" > 0';
  if (mode === INBOX_MODES.BLOCKED) return BLOCKED_MODE_THREAD_FILTER;
  return 'AND thread."isArchived" = false';
}

export interface RawEmailRow {
  id: string;
  userId: string;
  threadId: string;
  emailThreadId: string;
  messageId: string;
  googleAccountId: string | null;
  office365AccountId: string | null;
  zohoAccountId: string | null;
  from: string | null;
  fromName: string | null;
  senderJobTitle: string | null;
  subject: string | null;
  summary: string | null;
  labels?: string;
  priorityExplanation?: string;
  githubMetadata?: string;
  isSnoozed: boolean;
  snoozeUntil: Date | null;
  isBatched: boolean;
  batchReleaseAt: Date | null;
  wasDeliveredEarly: boolean;
  batchDecisionReason: string | null;
  isRead: boolean;
  isProcessingPriority: boolean;
  isProcessingSummary: boolean;
  receivedAt: Date;
  starCount: number;
  isArchived: boolean;
  urgencyScore: number | null;
  threadUpdatedAt: Date;
  // resolved from user_contexts JOIN — not stored on thread
  categoryName: string | null;
  categoryExplanation: string | null;
  categoryId: string | null;
  protoCategoryName: string | null;
  protoCategoryDescription: string | null;
  correspondentEmail: string | null;
  correspondentName: string | null;
  phishingConfidence: "low" | "medium" | "high" | null;
  phishingReason: string | null;
  priorityScore: number | null;
  cc: string | null;
  latestFrom?: string | null;
  /** Aggregated encrypted labels from all emails in the thread (used for blocked-mode app-level filter). */
  allThreadLabels?: string[] | null;
}

// System labels shared across providers (Gmail, O365, Zoho)
export const SYSTEM_LABELS = new Set([
  "INBOX",
  "SENT",
  "TRASH",
  "SPAM",
  "DRAFT",
  "UNREAD",
  "STARRED",
  "IMPORTANT",
  "CATEGORY_PERSONAL",
  "CATEGORY_SOCIAL",
  "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES",
  "CATEGORY_FORUMS",
  "GREEN_CIRCLE",
  "BLUE_STAR",
  "YELLOW_STAR",
  "RED_BANG",
  "YELLOW_BANG",
  "PURPLE_QUESTION",
  "ORANGE_GUILLEMET",
  "BLUE_INFO",
  "RED_MINUS",
  "YELLOW_MINUS",
  "GREEN_CHECK",
  "BLUE_CHECK",
  "RED_CHECK",
  "ORANGE_CHECK",
]);

/**
 * Fuzzy lookup of a category name in the name→UUID map.
 * Tries exact match first, then strips parentheticals, then prefix-matches.
 */
export function lookupCategoryIdByName(
  name: string,
  categoryNameToId: Map<string, string>,
): string | null {
  const exact = categoryNameToId.get(name);
  if (exact) return exact;
  const nl = name.toLowerCase().trim();
  const np = nl.replace(/\s*\(.*\)\s*$/, "").trim();
  for (const [key, id] of categoryNameToId.entries()) {
    const kl = key.toLowerCase().trim();
    if (kl === np || nl.startsWith(kl) || kl.startsWith(nl)) return id;
  }
  return null;
}

/**
 * Returns true if any of the aggregated encrypted label values in a thread
 * contain the "BearlyMail-Blocked" label after decryption.
 */
export function threadHasBlockedLabel(
  allThreadLabels: string[] | null | undefined,
): boolean {
  if (!allThreadLabels || allThreadLabels.length === 0) return false;
  return allThreadLabels.some((encryptedLabels) => {
    try {
      const decrypted = EncryptionHelper.decrypt(encryptedLabels) || "[]";
      const parsed: unknown = JSON.parse(decrypted);
      return Array.isArray(parsed) && parsed.includes("BearlyMail-Blocked");
    } catch {
      return false;
    }
  });
}
