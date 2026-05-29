/**
 * useEmailDetailSendHelpers.ts
 *
 * Helper types and pure functions for sending replies in useEmailDetailOperations.
 * Extracted to keep the main hook file under the max-lines limit.
 */
import axios from 'axios';
import i18n from 'i18next';

import { API_URL } from 'config/api';
import { HOURS_IN_TWO_DAYS, HOURS_PER_DAY } from 'constants/numbers';
import { REPLY_MODE_FORWARD, REPLY_MODE_REPLY_ALL } from 'constants/strings';

export interface SendReplyPayload {
  emailId: string;
  draft: string;
  recipients: string;
  cc: string | null;
  bcc: string | null;
  replyMode: string;
  subject?: string;
  expectedReplyHours?: number;
  /**
   * Free-text follow-up window ("3d", "next Monday") typed via the custom
   * option. Parsed server-side with the same parser as snooze. Takes
   * precedence over expectedReplyHours when set.
   */
  expectedReplyDuration?: string;
  scheduledSendAt?: Date;
  files: File[];
  /** Inline images keyed by their CID (from <img src="cid:…"> in the draft). */
  inlineImages?: Map<string, File>;
  /** Attachment IDs from the original email to carry through when forwarding. */
  forwardAttachmentIds?: string[];
  /**
   * User checked "Keep in Action" in the composer footer. Tells the server
   * to preserve the thread's star count and archive state (no follow-up,
   * no archive).
   */
  keepInAction?: boolean;
}

export function buildSendReplyFormData(payload: SendReplyPayload): FormData {
  const formData = new FormData();
  formData.append('reply', payload.draft);
  formData.append('recipients', payload.recipients);
  formData.append('replyAll', String(payload.replyMode === REPLY_MODE_REPLY_ALL));
  formData.append('isForward', String(payload.replyMode === REPLY_MODE_FORWARD));
  if (payload.subject) {
    formData.append('subject', payload.subject);
  }
  if (payload.cc) {
    formData.append('cc', payload.cc);
  }
  if (payload.bcc) {
    formData.append('bcc', payload.bcc);
  }
  if (payload.expectedReplyHours !== undefined) {
    formData.append('expectedReplyHours', String(payload.expectedReplyHours));
  }
  if (payload.expectedReplyDuration) {
    formData.append('expectedReplyDuration', payload.expectedReplyDuration);
    // Tell the server which language to parse the free-text duration in.
    formData.append('locale', i18n.language);
  }
  if (payload.keepInAction) {
    formData.append('keepInAction', 'true');
  }
  if (payload.scheduledSendAt) {
    formData.append('scheduledSendAt', payload.scheduledSendAt.toISOString());
  }
  if (payload.forwardAttachmentIds && payload.forwardAttachmentIds.length > 0) {
    formData.append('forwardAttachmentIds', JSON.stringify(payload.forwardAttachmentIds));
  }
  payload.files.forEach(file => {
    formData.append('files', file);
  });
  // Encode inline images: filename = "<cid>::::<original_filename>"
  payload.inlineImages?.forEach((file, cid) => {
    formData.append('inlineImages', file, `${cid}::::${file.name}`);
  });
  return formData;
}

export async function sendReplyRequest(payload: SendReplyPayload): Promise<void> {
  const hasAttachments = payload.files.length > 0 || (payload.inlineImages && payload.inlineImages.size > 0);
  if (hasAttachments) {
    const formData = buildSendReplyFormData(payload);
    await axios.post(`${API_URL}/replies/send/${payload.emailId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  } else {
    await axios.post(`${API_URL}/replies/send/${payload.emailId}`, {
      reply: payload.draft,
      recipients: payload.recipients,
      cc: payload.cc || undefined,
      bcc: payload.bcc || undefined,
      replyAll: payload.replyMode === REPLY_MODE_REPLY_ALL,
      isForward: payload.replyMode === REPLY_MODE_FORWARD,
      subject: payload.subject || undefined,
      forwardAttachmentIds: payload.forwardAttachmentIds?.length ? payload.forwardAttachmentIds : undefined,
      expectedReplyHours: payload.expectedReplyHours,
      expectedReplyDuration: payload.expectedReplyDuration || undefined,
      // Tell the server which language to parse the free-text duration in.
      locale: payload.expectedReplyDuration ? i18n.language : undefined,
      scheduledSendAt: payload.scheduledSendAt?.toISOString(),
      keepInAction: payload.keepInAction || undefined,
    });
  }
}

export interface PostSendRoutingParams {
  keepInAction?: boolean;
  expectedReplyHours?: number;
  /** Raw free-text follow-up window typed via the custom option. */
  expectedReplyDuration?: string;
  scheduledSendAt?: Date;
  performArchiveAfterReply: () => void;
  performSnoozeAfterReply: (duration: string) => void;
  navigate: (path: string) => void;
  getInboxPath: () => string;
}

export function routeAfterSend({
  keepInAction,
  expectedReplyHours,
  expectedReplyDuration,
  scheduledSendAt,
  performArchiveAfterReply,
  performSnoozeAfterReply,
  navigate,
  getInboxPath,
}: PostSendRoutingParams): void {
  if (keepInAction) {
    return;
  }
  // A custom follow-up window is snoozed with the raw text the user typed; the
  // snooze endpoint parses it with the same parser used for expectedReplyHours.
  if (expectedReplyDuration) {
    performSnoozeAfterReply(expectedReplyDuration);
    return;
  }
  if (expectedReplyHours !== undefined) {
    if (expectedReplyHours === 0) {
      performArchiveAfterReply();
    } else {
      const duration =
        expectedReplyHours <= HOURS_IN_TWO_DAYS
          ? `${expectedReplyHours}h`
          : `${Math.round(expectedReplyHours / HOURS_PER_DAY)}d`;
      performSnoozeAfterReply(duration);
    }
  } else {
    navigate(getInboxPath());
  }
}
