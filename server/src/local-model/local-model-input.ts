import * as crypto from "crypto";

import { GMAIL_LABELS } from "../constants/email-labels";
import { Email } from "../database/entities/email.entity";
import { LocalModelThreadInput } from "./local-model.types";

/**
 * Builds the inference payload for a thread so it matches **exactly** how the
 * model was trained — the export's feature derivation
 * (server/src/emails/email-export.service.ts → ExportEmailRecord). If these
 * drift, the served model scores live threads against features it never saw
 * (train/serve skew), so this mirrors that logic deliberately and is unit
 * tested against it.
 */

/** `.*@domain$` regex pattern for the sender domain — the form the model's
 * sender-domain feature was trained on. Mirrors EmailExportService.extractDomainPattern. */
export function senderDomainPattern(from: string | null | undefined): string {
  const address = extractEmailAddress(from);
  if (!address) return "";
  const atIndex = address.lastIndexOf("@");
  if (atIndex === -1) return "";
  const domain = address.slice(atIndex + 1);
  if (!domain) return "";
  // Escape every regex metacharacter, not just `.`, so an address with other
  // metachars can't inject regex syntax into the pattern (incomplete
  // sanitization, CWE-116). Valid domains only contain `.`, so the output is
  // unchanged for real senders (must mirror
  // EmailExportService.extractDomainPattern to avoid train/serve skew).
  return `.*@${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}

/** SHA-256 of the lowercased sender address, or null. Mirrors the export. */
export function senderHash(from: string | null | undefined): string | null {
  const address = extractEmailAddress(from);
  if (!address || !address.includes("@")) return null;
  return crypto
    .createHash("sha256")
    .update(address.toLowerCase())
    .digest("hex");
}

/** Received = not sent by the user (sent mail carries the SENT label). */
export function isReceived(labels: string[] | null | undefined): boolean {
  if (!Array.isArray(labels)) return true;
  return !labels.includes(GMAIL_LABELS.SENT);
}

function extractEmailAddress(from: string | null | undefined): string {
  if (!from) return "";
  const angle = from.match(/<([^>]+)>/);
  return angle ? angle[1].trim() : from.trim().split(/\s+/)[0];
}

export function buildLocalModelInput(
  email: Email,
  threadLength = 1,
): LocalModelThreadInput {
  return {
    threadId: email.threadId ?? "",
    subject: email.subject ?? "",
    body: email.body ?? "",
    senderDomain: senderDomainPattern(email.from),
    senderHash: senderHash(email.from),
    isReceived: isReceived(email.labels),
    isRead: email.isRead,
    hasAttachments:
      Array.isArray(email.attachments) && email.attachments.length > 0,
    receivedAt: email.receivedAt ? email.receivedAt.toISOString() : "",
    threadLength,
  };
}
