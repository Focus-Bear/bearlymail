import type { EmailMetadata } from "../category-rules/category-rules.types";
import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import { Email } from "../database/entities/email.entity";
import { buildRuleMatchText } from "../llm/email-content-cleaner";
import { resolveNotificationSubtype } from "../utils/notification-subtype.util";

/**
 * Builds the metadata used to evaluate deterministic category/priority rules
 * against an email. Shared so the single and batch refine paths match emails
 * identically.
 *
 * The notification subtype is resolved from the RAW body + HTML (href included)
 * rather than the href-stripped `bodyTextForMatch`, so rules keyed on the
 * sub-stream (e.g. GitHub PR vs issue) still match reliably.
 */
export function buildRuleEmailMetadata(email: Email): EmailMetadata {
  return {
    from: email.from || "",
    subject: email.subject || "",
    bodyTextForMatch: buildRuleMatchText(
      email.body || "",
      email.htmlBody,
      BODY_PREVIEW_LENGTHS.RULE_MATCH,
    ),
    notificationSubtype:
      resolveNotificationSubtype({
        from: email.from || "",
        subject: email.subject || "",
        body: email.body,
        htmlBody: email.htmlBody,
      }) ?? undefined,
  };
}
