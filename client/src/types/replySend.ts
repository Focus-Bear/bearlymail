/**
 * Everything one reply/forward send carries from the composer to
 * `POST /replies/send/:id`. A single typed object end to end, so adding an
 * option never means threading another positional argument through the flow.
 */
export interface ReplySendOptions {
  files?: File[];
  /** Inline images keyed by their CID (from <img src="cid:…"> in the draft). */
  inlineImages?: Map<string, File>;
  /** Follow-up window in whole hours; 0 means no follow-up. */
  expectedReplyHours?: number;
  /** Free-text follow-up window ("3d", "next Monday"); wins over expectedReplyHours. */
  expectedReplyDuration?: string;
  forwardAttachmentIds?: string[];
  /** Filenames of the forwarded attachments kept, so the tone check knows they are attached. */
  forwardAttachmentFilenames?: string[];
  /** Send this text as-is, skipping the tone check (revised text / send anyway). */
  draftOverride?: string;
  scheduledSendAt?: Date;
  /** "I still need to take action": keep the thread's star count and archive state. */
  keepInAction?: boolean;
  /** Per-message open-tracking choice; undefined defers to the account setting. */
  trackOpens?: boolean;
}

/** The part of a send decided by the composer footer controls. */
export type ReplyFooterSendRequest = Pick<
  ReplySendOptions,
  'expectedReplyHours' | 'expectedReplyDuration' | 'draftOverride' | 'scheduledSendAt' | 'keepInAction'
>;
