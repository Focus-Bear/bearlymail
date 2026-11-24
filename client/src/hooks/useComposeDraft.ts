import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { SavedDraft } from 'types/draft';
import { savedDraftAttachmentsToFiles, splitDraftRecipients } from 'utils/savedDraft';

import { API_URL } from 'config/api';
import { COMPOSE_DRAFT_ID_PARAM, DRAFTS_ENDPOINT } from 'constants/drafts';

interface Recipient {
  email: string;
  name?: string;
}

/** The Compose form setters a saved draft fills in. */
export interface ComposeDraftTarget {
  setTo: (recipients: Recipient[]) => void;
  setCc: (recipients: Recipient[]) => void;
  setBcc: (recipients: Recipient[]) => void;
  setShowCc: (isShown: boolean) => void;
  setShowBcc: (isShown: boolean) => void;
  setSubject: (subject: string) => void;
  setBody: (body: string) => void;
  setAttachments: (files: File[]) => void;
}

const toRecipients = (addresses: string | null | undefined): Recipient[] =>
  splitDraftRecipients(addresses).map(email => ({ email }));

function applyDraft(draft: SavedDraft, target: ComposeDraftTarget): void {
  const cc = toRecipients(draft.cc);
  const bcc = toRecipients(draft.bcc);
  target.setTo(toRecipients(draft.recipients));
  target.setCc(cc);
  target.setBcc(bcc);
  target.setShowCc(cc.length > 0);
  target.setShowBcc(bcc.length > 0);
  target.setSubject(draft.subject ?? '');
  target.setBody(draft.content);
  target.setAttachments(savedDraftAttachmentsToFiles(draft.attachments));
}

/**
 * Opens a saved new-message draft (one an AI assistant prepared) when Compose
 * is reached with `?draftId=`, and deletes it once the message is sent so it
 * doesn't linger as an unsent draft.
 */
export function useComposeDraft(target: ComposeDraftTarget, onLoadFailed: () => void) {
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get(COMPOSE_DRAFT_ID_PARAM);
  // Read through a ref so a re-render with new callbacks doesn't reload the draft.
  const callbacksRef = useRef({ target, onLoadFailed });
  callbacksRef.current = { target, onLoadFailed };

  useEffect(() => {
    if (!draftId) {
      return;
    }
    let isCurrent = true;
    const loadDraft = async () => {
      try {
        const response = await axios.get<SavedDraft>(`${API_URL}${DRAFTS_ENDPOINT}/${encodeURIComponent(draftId)}`);
        if (isCurrent) {
          applyDraft(response.data, callbacksRef.current.target);
        }
      } catch (error: unknown) {
        console.error('Error loading draft:', error);
        if (isCurrent) {
          callbacksRef.current.onLoadFailed();
        }
      }
    };
    void loadDraft();
    return () => {
      isCurrent = false;
    };
  }, [draftId]);

  const discardSentDraft = useCallback(async () => {
    if (!draftId) {
      return;
    }
    try {
      await axios.delete(`${API_URL}${DRAFTS_ENDPOINT}/${encodeURIComponent(draftId)}`);
    } catch (error: unknown) {
      console.error('Error deleting sent draft:', error);
    }
  }, [draftId]);

  return { discardSentDraft };
}
