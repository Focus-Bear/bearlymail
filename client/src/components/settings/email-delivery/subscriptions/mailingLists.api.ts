import axios from 'axios';

import { API_URL } from 'config/api';
import {
  UNSUBSCRIBE_ENDPOINTS,
  UNSUBSCRIBE_OUTCOMES,
  UnsubscribeMethod,
  UnsubscribeOutcome,
} from 'constants/unsubscribe';

/** One mailing list from `GET /mailing-lists` (see server `MailingListsService`). */
export interface MailingList {
  /** The sender's latest email with unsubscribe info; the unsubscribe endpoints act on it. */
  emailId: string;
  name: string | null;
  address: string;
  emailCount: number;
  triageThreadCount: number;
  lastReceivedAt: string;
  perWeek: number;
  method: UnsubscribeMethod;
}

interface UnsubscribeResponse {
  outcome: UnsubscribeOutcome;
  method: UnsubscribeMethod;
  url?: string;
}

export async function fetchMailingLists(): Promise<MailingList[]> {
  const response = await axios.get<{ mailingLists: MailingList[] }>(`${API_URL}${UNSUBSCRIBE_ENDPOINTS.mailingLists}`);
  return response.data.mailingLists;
}

/**
 * Unsubscribes with the method the user saw and confirmed (the server refuses
 * any other). Returns the page to finish on when the sender needs one.
 */
export async function unsubscribeFromList(list: MailingList): Promise<{ finishUrl: string | null }> {
  const response = await axios.post<UnsubscribeResponse>(`${API_URL}${UNSUBSCRIBE_ENDPOINTS.unsubscribe(list.emailId)}`, {
    method: list.method,
  });
  const { outcome, url } = response.data;
  return { finishUrl: outcome === UNSUBSCRIBE_OUTCOMES.OPEN_LINK ? (url ?? null) : null };
}

/** Archives all the sender's Triage threads and auto-archives anything they send later. */
export async function archiveListSender(list: MailingList): Promise<number> {
  const response = await axios.post<{ archivedCount: number }>(
    `${API_URL}${UNSUBSCRIBE_ENDPOINTS.archiveSender(list.emailId)}`,
    { includeThisThread: true }
  );
  return response.data.archivedCount;
}
