import { TONE_CHECK } from "../constants/tone-check.constants";
import type { ToneCheckRecipient, ToneCheckResult } from "./llm-tone.types";

/** Renders one recipient for the prompt as `Name <email>` (or just the email). */
export function describeRecipient(recipient: ToneCheckRecipient): string {
  const name = recipient.name?.trim();
  return name ? `${name} <${recipient.email}>` : recipient.email;
}

function mentionsAttachment(suggestion: string): boolean {
  const lowered = suggestion.toLowerCase();
  return TONE_CHECK.ATTACHMENT_SUGGESTION_KEYWORDS.some((keyword) =>
    lowered.includes(keyword),
  );
}

/**
 * Belt-and-braces for the "you forgot the attachment" nag: the model sometimes
 * flags a missing attachment even when files ARE attached, and sometimes puts
 * that complaint in `suggestions` (where it blocks the send) instead of the
 * dedicated `attachmentReminder` field. When the draft carries attachments,
 * drop both. A result whose only suggestion was the bogus attachment complaint
 * becomes `isOk` again so the send is not blocked.
 */
export function suppressAttachmentNagsWhenAttached(
  result: ToneCheckResult,
  attachmentFilenames: string[],
): ToneCheckResult {
  if (attachmentFilenames.length === 0) {
    return result;
  }
  const suggestions = (result.suggestions ?? []).filter(
    (suggestion) => !mentionsAttachment(suggestion),
  );
  const isOk = result.isOk || suggestions.length === 0;
  return {
    ...result,
    isOk,
    suggestions: isOk ? [] : suggestions,
    revisedText: isOk ? undefined : result.revisedText,
    attachmentReminder: null,
  };
}
