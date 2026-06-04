import type { EmailMetadata } from "../category-rules/category-rules.types";
import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import { Email } from "../database/entities/email.entity";
import { buildRuleMatchText } from "../llm/email-content-cleaner";

/**
 * Builds the metadata used to evaluate deterministic category/priority rules
 * against an email. Shared so the single and batch refine paths match emails
 * identically.
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
  };
}
