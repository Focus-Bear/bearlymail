/**
 * useEmailDetailSendHelpers.ts
 *
 * Helper types and pure functions for sending replies in useEmailDetailOperations.
 * Extracted to keep the main hook file under the max-lines limit.
 */
import axios from 'axios';

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
  expectedReplyHours?: number;
  scheduledSendAt?: Date;
  files: File[];
  /** Inline images keyed by their CID (from <img src="cid:…"> in the draft). */
  inlineImages?: Map<string, File>;
  /** Attachment IDs from the original email to carry through when forwarding. */
  forwardAttachmentIds?: string[];
}

export function buildSendReplyFormData(payload: SendReplyPayload): FormData {
  const formData = new FormData();
  formData.append('reply', payload.draft);
  formData.append('recipients', payload.recipients);
  formData.append('replyAll', String(payload.replyMode === REPLY_MODE_REPLY_ALL));
  formData.append('isForward', String(payload.replyMode === REPLY_MODE_FORWARD));
  if (payload.cc) {
    formData.append('cc', payload.cc);
  }
  if (payload.bcc) {
    formData.append('bcc', payload.bcc);
  }
  if (payload.expectedReplyHours !== undefined) {
    formData.append('expectedReplyHours', String(payload.expectedReplyHours));
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
  const hasAttachments =
    payload.files.length > 0 || (payload.inlineImages && payload.inlineImages.size > 0);
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
      forwardAttachmentIds: payload.forwardAttachmentIds?.length ? payload.forwardAttachmentIds : undefined,
      expectedReplyHours: payload.expectedReplyHours,
      scheduledSendAt: payload.scheduledSendAt?.toISOString(),
    });
  }
}

export interface PostSendRoutingParams {
  keepInAction?: boolean;
  expectedReplyHours?: number;
  scheduledSendAt?: Date;
  performArchiveAfterReply: () => void;
  performSnoozeAfterReply: (duration: string) => void;
  navigate: (path: string) => void;
  getInboxPath: () => string;
}

export function routeAfterSend({
  keepInAction,
  expectedReplyHours,
  scheduledSendAt,
  performArchiveAfterReply,
  performSnoozeAfterReply,
  navigate,
  getInboxPath,
}: PostSendRoutingParams): void {
  if (keepInAction) {
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
