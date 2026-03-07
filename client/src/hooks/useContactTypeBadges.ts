import { useCallback,useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ContactTypeConfig } from 'types/contact';
import { Email } from 'types/email';

import { API_URL } from 'config/api';

export function useContactTypeBadges(emails: Email[], loading: boolean) {
  const [contactTypeMap, setContactTypeMap] = useState<Record<string, string>>({});
  const [contactTypeConfigs, setContactTypeConfigs] = useState<ContactTypeConfig[]>([]);
  const fetchedEmailsKey = useRef<string>('');
  const configsFetched = useRef(false);

  const fetchConfigs = useCallback(async () => {
    if (configsFetched.current) return;
    try {
      const response = await axios.get(`${API_URL}/contacts/types`);
      setContactTypeConfigs(response.data);
      configsFetched.current = true;
    } catch {
      // non-critical, ignore
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  useEffect(() => {
    if (loading || emails.length === 0) return;

    const senderEmails = emails
      .map(event => event.correspondentEmail || event.from)
      .filter(Boolean)
      .map(event => event!.toLowerCase());

    const uniqueEmails = [...new Set(senderEmails)];
    const key = uniqueEmails.sort().join(',');

    if (key === fetchedEmailsKey.current) return;
    fetchedEmailsKey.current = key;

    const fetchTypes = async () => {
      try {
        const response = await axios.get(`${API_URL}/contacts/contact-types-by-emails`, {
          params: { emails: uniqueEmails.join(',') },
        });
        setContactTypeMap(response.data);
      } catch {
        // non-critical, ignore
      }
    };

    fetchTypes();
  }, [emails, loading]);

  const getContactTypeConfig = useCallback((email: string | null | undefined): ContactTypeConfig | undefined => {
    if (!email) return undefined;
    const typeName = contactTypeMap[email.toLowerCase()];
    if (!typeName) return undefined;
    return contactTypeConfigs.find(ct => ct.name === typeName);
  }, [contactTypeMap, contactTypeConfigs]);

  return { contactTypeMap, contactTypeConfigs, getContactTypeConfig };
}
