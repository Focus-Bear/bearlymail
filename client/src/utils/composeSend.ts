import axios from 'axios';

import { API_URL } from 'config/api';

export interface ComposeSendArgs {
  to: { email: string; name?: string }[];
  cc: { email: string; name?: string }[];
  bcc: { email: string; name?: string }[];
  subject: string;
  body: string;
  attachments: File[];
  scheduledSendAtIso?: string;
  userTimezone: string;
  /** Free-text follow-up window; undefined when the user cleared the field. */
  expectedReplyDuration?: string;
  /** UI language, so the server parses the duration the way the user typed it. */
  locale: string;
}

/**
 * The endpoint queues the message rather than sending it, so it answers with a
 * correlation id. `sendId` is absent on the scheduled-send path.
 */
export interface ComposeSendResponse {
  sendId?: string;
}

/**
 * POSTs a composed email to /emails/send. When attachments are present the
 * request must be multipart/form-data (the endpoint reads files via Multer's
 * `files` field); recipient objects are JSON-encoded so the server parses them
 * back into arrays. Otherwise a plain JSON body is sent.
 */
export const postComposedEmail = async (args: ComposeSendArgs): Promise<ComposeSendResponse> => {
  const { to, cc, bcc, subject, body, attachments, scheduledSendAtIso, userTimezone } = args;
  const { expectedReplyDuration, locale } = args;

  if (attachments.length === 0) {
    const response = await axios.post<ComposeSendResponse>(`${API_URL}/emails/send`, {
      to,
      cc: cc.length > 0 ? cc : undefined,
      bcc: bcc.length > 0 ? bcc : undefined,
      subject,
      body,
      scheduledSendAt: scheduledSendAtIso,
      userTimezone: scheduledSendAtIso ? userTimezone : undefined,
      expectedReplyDuration,
      locale: expectedReplyDuration ? locale : undefined,
    });
    return response.data;
  }

  const formData = new FormData();
  formData.append('to', JSON.stringify(to));
  if (cc.length > 0) {
    formData.append('cc', JSON.stringify(cc));
  }
  if (bcc.length > 0) {
    formData.append('bcc', JSON.stringify(bcc));
  }
  formData.append('subject', subject);
  formData.append('body', body);
  if (scheduledSendAtIso) {
    formData.append('scheduledSendAt', scheduledSendAtIso);
    formData.append('userTimezone', userTimezone);
  }
  if (expectedReplyDuration) {
    formData.append('expectedReplyDuration', expectedReplyDuration);
    formData.append('locale', locale);
  }
  attachments.forEach(file => formData.append('files', file));
  // Let Axios/the browser set Content-Type with the multipart boundary — an
  // explicit 'multipart/form-data' header omits the boundary and breaks Multer.
  const response = await axios.post<ComposeSendResponse>(`${API_URL}/emails/send`, formData);
  return response.data;
};
