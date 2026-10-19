import { stripHtmlTags } from 'utils/emailBodyUtils';

const INLINE_IMAGE_TAG_RE = /<img\b/i;

const hasVisibleContent = (draftHtml: string): boolean =>
  INLINE_IMAGE_TAG_RE.test(draftHtml) || stripHtmlTags(draftHtml).trim().length > 0;

interface ReplyDraftSnapshot {
  /** Current body HTML. The signature is added at send time, so it is never part of this. */
  draft: string | null;
  /** Body the composer opened with: empty for a new reply, the saved text for a restored draft. */
  initialDraft: string | null;
  /** Files the user attached (forwarded attachments don't count — they came with the original). */
  attachedFileCount: number;
}

/**
 * True when closing the reply would throw away something the user added:
 * attached files, or body text that differs from what the composer opened
 * with. A restored draft the user hasn't touched is already saved, so closing
 * it loses nothing.
 */
export function hasUnsentReplyChanges({ draft, initialDraft, attachedFileCount }: ReplyDraftSnapshot): boolean {
  if (attachedFileCount > 0) {
    return true;
  }
  const currentDraft = draft ?? '';
  return currentDraft !== (initialDraft ?? '') && hasVisibleContent(currentDraft);
}
