export type ReplyAttachment = {
  filename: string;
  mimeType: string;
  content: Buffer;
};

export type InlineImage = {
  contentId: string;
  filename: string;
  mimeType: string;
  content: Buffer;
};

/** Everything RepliesService.sendReply accepts besides the email and body. */
export interface SendReplyRequestOptions {
  attachments?: ReplyAttachment[];
  /** Inline images to embed as CID MIME parts in the email. */
  inlineImages?: InlineImage[];
  expectedReplyHours?: number;
  forwardAttachmentIds?: string[];
  recipients?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  isForward?: boolean;
  /**
   * User explicitly chose "Keep in Action" — preserve the thread state
   * (no follow-up, no archive). Defaults to false.
   */
  keepInAction?: boolean;
  /** Composer's per-message open-tracking choice; undefined = the setting. */
  trackOpens?: boolean;
}
