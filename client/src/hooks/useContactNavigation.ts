// Hook for navigating to a contact's detail page by email address.
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

import { API_URL } from 'config/api';

interface ContactSearchResult {
  id: string;
  email?: string;
  name?: string;
}

/**
 * Returns a stable callback that navigates to a contact's detail page.
 *
 * Fast path: if `senderContactId` is provided (pre-resolved at email ingest),
 * navigates directly without any API call.
 *
 * Fallback: searches the contacts API by email address (handles senders not
 * yet in the contacts table, or emails ingested before senderContactId was added).
 *
 * Falls back to the contacts list page when no matching contact is found.
 */
export function useContactNavigation() {
  const navigate = useNavigate();

  const navigateToContact = useCallback(
    async (
      event: React.SyntheticEvent,
      emailAddress: string | null | undefined,
      senderContactId?: string | null,
      options?: { newTab?: boolean }
    ) => {
      // Prevent the click from bubbling up to email list/thread selection handlers.
      event.stopPropagation();
      event.preventDefault();

      // `newTab` opens the contact in a new browser tab (used from the open/split
      // email-detail header); otherwise navigate in place.
      const open = (path: string) => {
        if (options?.newTab) {
          window.open(path, '_blank', 'noopener,noreferrer');
        } else {
          navigate(path);
        }
      };

      // Fast path: use pre-resolved contact ID from email entity
      if (senderContactId) {
        open(`/crm/contacts/${senderContactId}`);
        return;
      }

      // Fallback: search API (for senders not in contacts, or legacy emails)
      if (!emailAddress) {
        open('/crm/contacts');
        return;
      }

      try {
        const response = await axios.get<ContactSearchResult[]>(`${API_URL}/contacts/search`, {
          params: { q: emailAddress, limit: 1 },
        });
        const match = response.data?.[0];
        open(match?.id ? `/crm/contacts/${match.id}` : '/crm/contacts');
      } catch (err) {
        console.error('[useContactNavigation] Failed to look up contact:', err);
        open('/crm/contacts');
      }
    },
    [navigate]
  );

  return { navigateToContact };
}
