import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { ContactDetail as ContactDetailType, ContactTypeConfig } from 'types/contact';

import { API_URL } from 'config/api';

export function useContactDetailData(contactId?: string) {
  const [contact, setContact] = useState<ContactDetailType | null>(null);
  const [contactTypes, setContactTypes] = useState<ContactTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContact = useCallback(async () => {
    if (!contactId) return;
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

  const fetchContactTypes = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/contacts/types`);
      setContactTypes(response.data);
    } catch (err) {
      console.error('Failed to fetch contact types:', err);
    }
  }, []);

  useEffect(() => {
    fetchContact();
    fetchContactTypes();
  }, [fetchContact, fetchContactTypes]);

  const getTypeConfig = useCallback((typeName?: string | null) => {
    if (!typeName) return undefined;
    return contactTypes.find(ct => ct.name === typeName);
  }, [contactTypes]);

  return { contact, contactTypes, loading, error, fetchContact, fetchContactTypes, getTypeConfig, setContact };
}

export default useContactDetailData;
