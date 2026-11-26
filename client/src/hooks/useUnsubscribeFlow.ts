import { useCallback, useMemo, useState } from 'react';
import axios from 'axios';
import { Email } from 'types/email';
import { captureEvent } from 'utils/posthog';
import { isSafeHttpsUrl, resolveUnsubscribeAction, UnsubscribeAction } from 'utils/unsubscribeUtils';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import {
  BLANK_PAGE_URL,
  NEW_TAB_FEATURES,
  NEW_TAB_TARGET,
  UNSUBSCRIBE_ENDPOINTS,
  UNSUBSCRIBE_METHODS,
  UNSUBSCRIBE_OUTCOMES,
  UnsubscribeMethod,
  UnsubscribeOutcome,
} from 'constants/unsubscribe';

export const UNSUBSCRIBE_FLOW_STEPS = {
  IDLE: 'idle',
  CONFIRM: 'confirm',
  WORKING: 'working',
  OPEN_LINK: 'open-link',
  OFFER_ARCHIVE: 'offer-archive',
  ERROR: 'error',
} as const;

export type UnsubscribeFlowStep =
  | { kind: typeof UNSUBSCRIBE_FLOW_STEPS.IDLE }
  | { kind: typeof UNSUBSCRIBE_FLOW_STEPS.CONFIRM; action: UnsubscribeAction }
  | { kind: typeof UNSUBSCRIBE_FLOW_STEPS.WORKING }
  | { kind: typeof UNSUBSCRIBE_FLOW_STEPS.OPEN_LINK; url: string; siblingCount: number }
  | {
      kind: typeof UNSUBSCRIBE_FLOW_STEPS.OFFER_ARCHIVE;
      outcome: UnsubscribeOutcome;
      /** Null when unknown (a body link opened without asking the server). */
      siblingCount: number | null;
    }
  | { kind: typeof UNSUBSCRIBE_FLOW_STEPS.ERROR };

interface UnsubscribeResponse {
  outcome: UnsubscribeOutcome;
  method: UnsubscribeMethod;
  url?: string;
  siblingCount: number;
}

interface ArchiveSenderResponse {
  archivedCount: number;
}

const IDLE_STEP: UnsubscribeFlowStep = { kind: UNSUBSCRIBE_FLOW_STEPS.IDLE };

function openInNewTab(url: string): void {
  if (isSafeHttpsUrl(url)) {
    window.open(url, NEW_TAB_TARGET, NEW_TAB_FEATURES);
  }
}

/**
 * Opened synchronously inside the confirm click so the browser treats it as user-initiated; the
 * real URL only arrives after the request, when a popup blocker would refuse a new window.
 */
function openPlaceholderTab(): Window | null {
  const tab = window.open(BLANK_PAGE_URL, NEW_TAB_TARGET);
  if (tab) {
    tab.opener = null;
  }
  return tab;
}


async function postUnsubscribe(emailId: string, method: UnsubscribeMethod): Promise<UnsubscribeResponse> {
  const response = await axios.post<UnsubscribeResponse>(`${API_URL}${UNSUBSCRIBE_ENDPOINTS.unsubscribe(emailId)}`, {
    method,
  });
  return response.data;
}

async function postArchiveSender(emailId: string): Promise<ArchiveSenderResponse> {
  const response = await axios.post<ArchiveSenderResponse>(`${API_URL}${UNSUBSCRIBE_ENDPOINTS.archiveSender(emailId)}`);
  return response.data;
}

interface UseUnsubscribeFlowProps {
  email: Email;
  /** Archives this email through the caller's usual flow (animation, list update, navigation). */
  onArchiveEmail: () => void;
}

export interface UnsubscribeFlow {
  /** How this email can be unsubscribed from; null hides the Unsubscribe action. */
  action: UnsubscribeAction | null;
  step: UnsubscribeFlowStep;
  senderName: string;
  /** The address a confirmed archive blocks (blocking is per address, not per name). */
  senderAddress: string;
  start: () => void;
  confirm: () => Promise<void>;
  openFallbackLink: () => void;
  archiveSender: () => Promise<void>;
  dismiss: () => void;
}

/**
 * Unsubscribe → confirm → (one-click / mailto on the server, or the sender's page in a new tab) →
 * offer to archive the sender's mail. Nothing happens before the user confirms.
 */
export function useUnsubscribeFlow({ email, onArchiveEmail }: UseUnsubscribeFlowProps): UnsubscribeFlow {
  const [step, setStep] = useState<UnsubscribeFlowStep>(IDLE_STEP);
  const action = useMemo(() => resolveUnsubscribeAction(email), [email]);
  const senderName = email.fromName || email.from;

  const dismiss = useCallback(() => setStep(IDLE_STEP), []);

  const start = useCallback(() => {
    if (!action) {
      return;
    }
    captureEvent(ANALYTICS_EVENTS.EMAIL_UNSUBSCRIBE_CLICKED, { email_id: email.id, method: action.method });
    setStep({ kind: UNSUBSCRIBE_FLOW_STEPS.CONFIRM, action });
  }, [action, email.id]);

  const finish = useCallback(
    (outcome: UnsubscribeOutcome, method: UnsubscribeMethod, siblingCount: number | null) => {
      captureEvent(ANALYTICS_EVENTS.EMAIL_UNSUBSCRIBE_COMPLETED, { email_id: email.id, method, outcome });
      setStep({ kind: UNSUBSCRIBE_FLOW_STEPS.OFFER_ARCHIVE, outcome, siblingCount });
    },
    [email.id]
  );

  const fail = useCallback(
    (method: UnsubscribeMethod) => {
      captureEvent(ANALYTICS_EVENTS.EMAIL_UNSUBSCRIBE_FAILED, { email_id: email.id, method });
      setStep({ kind: UNSUBSCRIBE_FLOW_STEPS.ERROR });
    },
    [email.id]
  );

  const applyServerResult = useCallback(
    (result: UnsubscribeResponse, placeholderTab: Window | null) => {
      if (result.outcome !== UNSUBSCRIBE_OUTCOMES.OPEN_LINK) {
        finish(result.outcome, result.method, result.siblingCount);
        return;
      }
      if (!isSafeHttpsUrl(result.url)) {
        placeholderTab?.close();
        fail(result.method);
        return;
      }
      if (placeholderTab) {
        placeholderTab.location.href = result.url;
        finish(result.outcome, result.method, result.siblingCount);
        return;
      }
      // A one-click that failed falls back to the page, and opening it now needs a fresh click.
      setStep({ kind: UNSUBSCRIBE_FLOW_STEPS.OPEN_LINK, url: result.url, siblingCount: result.siblingCount });
    },
    [finish, fail]
  );

  const confirmWithServer = useCallback(
    async (method: UnsubscribeMethod) => {
      const placeholderTab = method === UNSUBSCRIBE_METHODS.LINK ? openPlaceholderTab() : null;
      setStep({ kind: UNSUBSCRIBE_FLOW_STEPS.WORKING });
      try {
        const result = await postUnsubscribe(email.id, method);
        applyServerResult(result, placeholderTab);
      } catch (error) {
        placeholderTab?.close();
        console.error('Error unsubscribing:', error);
        fail(method);
      }
    },
    [email.id, applyServerResult, fail]
  );

  const confirm = useCallback(async () => {
    if (step.kind !== UNSUBSCRIBE_FLOW_STEPS.CONFIRM) {
      return;
    }
    const { method, bodyUrl } = step.action;
    captureEvent(ANALYTICS_EVENTS.EMAIL_UNSUBSCRIBE_CONFIRMED, { email_id: email.id, method });
    if (bodyUrl) {
      openInNewTab(bodyUrl);
      finish(UNSUBSCRIBE_OUTCOMES.OPEN_LINK, method, null);
      return;
    }
    await confirmWithServer(method);
  }, [step, email.id, finish, confirmWithServer]);

  const openFallbackLink = useCallback(() => {
    if (step.kind !== UNSUBSCRIBE_FLOW_STEPS.OPEN_LINK) {
      return;
    }
    openInNewTab(step.url);
    finish(UNSUBSCRIBE_OUTCOMES.OPEN_LINK, UNSUBSCRIBE_METHODS.LINK, step.siblingCount);
  }, [step, finish]);

  const archiveSender = useCallback(async () => {
    setStep(IDLE_STEP);
    onArchiveEmail();
    try {
      const archived = await postArchiveSender(email.id);
      captureEvent(ANALYTICS_EVENTS.EMAIL_UNSUBSCRIBE_SENDER_ARCHIVED, {
        email_id: email.id,
        archived_count: archived.archivedCount,
      });
    } catch (error) {
      console.error('Error archiving the unsubscribed sender:', error);
    }
  }, [email.id, onArchiveEmail]);

  return { action, step, senderName, senderAddress: email.from, start, confirm, openFallbackLink, archiveSender, dismiss };
}
