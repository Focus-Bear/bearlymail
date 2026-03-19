/**
 * useContactsData
 *
 * Migrated /contacts/types fetch to useContactTypesQuery (TanStack Query).
 * The fetchContactTypes() method and local contactTypes state have been removed;
 * contactTypes now comes from the shared query cache (staleTime: 5 min).
 *
 * Part of: plan #1225 / PR #1236 — Wave 1 (static endpoints)
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useContactTypesQuery } from 'queries/useContactTypesQuery';
import { Contact, ContactTypeConfig } from 'types/contact';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { getPusherInstance } from 'config/pusher';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { MILLISECONDS_PER_MINUTE, TOAST_DURATION_MS } from 'constants/numbers';

export interface UseContactsDataResult {
  contacts: Contact[];
  contactTypes: ContactTypeConfig[];
  loading: boolean;
  syncing: boolean;
  error: string | null;
  fetchContacts: () => Promise<void>;
  handleSync: () => Promise<void>;
  getContactTypeConfig: (typeName: string | null | undefined) => ContactTypeConfig | undefined;
}

export const useContactsData = (userId: string | undefined): UseContactsDataResult => {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Contact types now served from the shared TanStack Query cache (staleTime: 5 min)
  const { data: contactTypes = [] } = useContactTypesQuery();

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${API_URL}/contacts`);
      setContacts(response.data);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
      setError(t('contacts.errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    captureEvent(ANALYTICS_EVENTS.CONTACTS_VIEWED);
    fetchContacts();
  }, [fetchContacts]);

  const handleSync = async () => {
    captureEvent(ANALYTICS_EVENTS.CONTACTS_SYNC_CLICKED);
    setSyncing(true);
    try {
      await axios.post(`${API_URL}/contacts/sync`);
      const pusher = getPusherInstance();
      if (!pusher) {
        const pollInterval = setInterval(async () => {
          try {
            const res = await axios.get(`${API_URL}/contacts`);
            if (res.data.length > 0) {
              clearInterval(pollInterval);
              setContacts(res.data);
              setSyncing(false);
            }
          } catch {
            clearInterval(pollInterval);
            setSyncing(false);
          }
        }, TOAST_DURATION_MS);
        setTimeout(() => {
          clearInterval(pollInterval);
          setSyncing(false);
          fetchContacts();
        }, MILLISECONDS_PER_MINUTE);
      }
    } catch (err) {
      console.error('Failed to sync contacts:', err);
      setError(t('contacts.errorSyncing'));
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!userId) {
      return;
    }

    const pusher = getPusherInstance();
    if (!pusher) {
      return;
    }

    const channel = pusher.subscribe(`user-${userId}`);

    channel.bind('contacts-sync-started', () => {
      setSyncing(true);
    });
    channel.bind('contacts-sync-complete', () => {
      setSyncing(false);
      fetchContacts();
    });
    channel.bind('contacts-sync-failed', (eventData: { error: string }) => {
      setSyncing(false);
      setError(eventData.error);
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`user-${userId}`);
    };
  }, [userId, fetchContacts]);

  const getContactTypeConfig = (typeName: string | null | undefined): ContactTypeConfig | undefined => {
    if (!typeName) {
      return undefined;
    }
    return contactTypes.find(ct => ct.name === typeName);
  };

  return { contacts, contactTypes, loading, syncing, error, fetchContacts, handleSync, getContactTypeConfig };
};
