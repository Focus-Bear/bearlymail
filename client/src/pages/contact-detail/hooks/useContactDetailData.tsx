/**
 * useContactDetailData (pages/contact-detail/hooks/)
 *
 * Migrated /contacts/types fetch to useContactTypesQuery (TanStack Query).
 * fetchContactTypes() and local contactTypes state removed — data now comes
 * from the shared query cache (staleTime: 5 min).
 *
 * Note: this file is a near-duplicate of hooks/useContactDetailData.ts.
 * Consolidation is tracked separately; this migration keeps them in sync.
 *
 * Part of: plan #1225 / PR #1236 — Wave 1 (static endpoints)
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useContactTypesQuery } from 'queries/useContactTypesQuery';
import { ContactDetail as ContactDetailType, ContactTypeConfig } from 'types/contact';

import { API_URL } from 'config/api';

export function useContactDetailData(contactId?: string) {
  const [contact, setContact] = useState<ContactDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Contact types served from the shared TanStack Query cache (staleTime: 5 min)
  const { data: contactTypes = [] } = useContactTypesQuery();

  const fetchContact = useCallback(async () => {
    if (!contactId) {
      return;
    }
    // Defensive: Google People API resource names (e.g. "people/c12345") are not
    // valid DB UUIDs. If the contactId contains a slash it was never a local record —
    // show a friendly error instead of making a doomed API call or rendering blank.
    if (contactId.includes('/')) {
      setError('This contact is not yet synced locally. Open the CRM to sync contacts.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/contacts/${contactId}`);
      setContact(response.data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch contact:', err);
      setError('Failed to load contact details.');
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  // Kept for API compatibility — callers that spread the return value may use this.
  // Now a no-op since contact types are fetched by the query hook automatically.
  const fetchContactTypes = useCallback(async () => {
    // no-op: data is served from useContactTypesQuery
  }, []);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  const getTypeConfig = useCallback(
    (typeName?: string | null): ContactTypeConfig | undefined => {
      if (!typeName) {
        return undefined;
      }
      return contactTypes.find(ct => ct.name === typeName);
    },
    [contactTypes]
  );

  return { contact, contactTypes, loading, error, fetchContact, fetchContactTypes, getTypeConfig, setContact };
}

export default useContactDetailData;
