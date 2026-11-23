/** A file saved with a draft; `content` is base64. */
export interface SavedDraftAttachment {
  filename: string;
  mimeType: string;
  content: string;
}

/**
 * A saved, unsent message as `/drafts` returns it: a reply draft (with
 * `emailThreadId`) or a new message an AI assistant prepared (without).
 * Recipient fields are comma-separated address lists.
 */
export interface SavedDraft {
  id: string;
  emailThreadId: string | null;
  content: string;
  replyMode?: 'reply' | 'replyAll' | 'forward';
  recipients: string | null;
  subject?: string | null;
  cc?: string | null;
  bcc?: string | null;
  attachments?: SavedDraftAttachment[] | null;
}
