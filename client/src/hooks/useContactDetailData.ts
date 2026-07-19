/**
 * useContactDetailData (hooks/)
 *
 * Migrated /contacts/types fetch to useContactTypesQuery (TanStack Query).
 * fetchContactTypes() and local contactTypes state removed — data now comes
 * from the shared query cache.
 *
 * Part of: plan #1225 / PR #1236 — Wave 1 (static endpoints)
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useContactTypesQuery } from 'queries/useContactTypesQuery';
import { ContactDetail, ContactTypeConfig } from 'types/contact';
import { devLog } from 'utils/dev-logger';

import { API_URL } from 'config/api';
import { FIELD_TYPE_TEXT } from 'constants/strings';

export interface UseContactDetailDataResult {
  contact: ContactDetail | null;
  contactTypes: ContactTypeConfig[];
  loading: boolean;
  error: string | null;
  editingField: string | null;
  editValue: string;
  newNote: string;
  addingNote: boolean;
  showAddCustomField: boolean;
  newFieldName: string;
  newFieldType: string;
  setEditingField: (field: string | null) => void;
  setEditValue: (value: string) => void;
  setNewNote: (note: string) => void;
  setShowAddCustomField: (show: boolean) => void;
  setNewFieldName: (name: string) => void;
  setNewFieldType: (type: string) => void;
  fetchContact: () => Promise<void>;
  handleUpdateField: (field: string, value: string | null) => Promise<void>;
  handleAddNote: () => Promise<void>;
  handleDeleteNote: (noteId: string) => Promise<void>;
  handleSetCustomFieldValue: (fieldId: string, value: string) => Promise<void>;
  handleAddCustomField: () => Promise<void>;
  getTypeConfig: (typeName: string | null | undefined) => ContactTypeConfig | undefined;
}

export const useContactDetailData = (contactId: string | undefined): UseContactDetailDataResult => {
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [showAddCustomField, setShowAddCustomField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<string>(FIELD_TYPE_TEXT);

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
    } catch (err) {
      console.error('Failed to fetch contact:', err);
      setError('Failed to load contact details.');
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  const fetchCustomFieldDefs = useCallback(() => {
    // Intentionally left as stub — real implementation would re-fetch custom field definitions
    devLog('fetchCustomFieldDefs called');
  }, []);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  const {
    handleUpdateField,
    handleAddNote,
    handleDeleteNote,
    handleSetCustomFieldValue,
    handleAddCustomField,
    getTypeConfig,
  } = useContactOperations({
    contactId,
    contactTypes,
    newNote,
    newFieldName,
    newFieldType,
    fetchContact,
    fetchCustomFieldDefs,
    setEditingField,
    setNewNote,
    setAddingNote,
    setNewFieldName,
    setNewFieldType,
    setShowAddCustomField,
  });

  return {
    contact,
    contactTypes,
    loading,
    error,
    editingField,
    editValue,
    newNote,
    addingNote,
    showAddCustomField,
    newFieldName,
    newFieldType,
    setEditingField,
    setEditValue,
    setNewNote,
    setShowAddCustomField,
    setNewFieldName,
    setNewFieldType,
    fetchContact,
    handleUpdateField,
    handleAddNote,
    handleDeleteNote,
    handleSetCustomFieldValue,
    handleAddCustomField,
    getTypeConfig,
  };
};

interface ContactOperationsParams {
  contactId: string | undefined;
  contactTypes: ContactTypeConfig[];
  newNote: string;
  newFieldName: string;
  newFieldType: string;
  fetchContact: () => Promise<void>;
  fetchCustomFieldDefs: () => void;
  setEditingField: (field: string | null) => void;
  setNewNote: (note: string) => void;
  setAddingNote: (adding: boolean) => void;
  setNewFieldName: (name: string) => void;
  setNewFieldType: (type: string) => void;
  setShowAddCustomField: (show: boolean) => void;
}

function useContactOperations({
  contactId,
  contactTypes,
  newNote,
  newFieldName,
  newFieldType,
  fetchContact,
  fetchCustomFieldDefs,
  setEditingField,
  setNewNote,
  setAddingNote,
  setNewFieldName,
  setNewFieldType,
  setShowAddCustomField,
}: ContactOperationsParams) {
  const handleUpdateField = async (field: string, value: string | null) => {
    if (!contactId) {
      return;
    }
    try {
      await axios.put(`${API_URL}/contacts/${contactId}`, { [field]: value });
      fetchContact();
      setEditingField(null);
    } catch (err) {
      console.error('Failed to update contact:', err);
    }
  };

  const handleAddNote = async () => {
    if (!contactId || !newNote.trim()) {
      return;
    }
    setAddingNote(true);
    try {
      await axios.post(`${API_URL}/contacts/${contactId}/notes`, { content: newNote });
      setNewNote('');
      fetchContact();
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!contactId) {
      return;
    }
    try {
      await axios.delete(`${API_URL}/contacts/${contactId}/notes/${noteId}`);
      fetchContact();
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  const handleSetCustomFieldValue = async (fieldId: string, value: string) => {
    if (!contactId) {
      return;
    }
    try {
      await axios.put(`${API_URL}/contacts/${contactId}/custom-fields/${fieldId}`, { value });
      fetchContact();
      setEditingField(null);
    } catch (err) {
      console.error('Failed to set custom field value:', err);
    }
  };

  const handleAddCustomField = async () => {
    if (!newFieldName.trim()) {
      return;
    }
    try {
      await axios.post(`${API_URL}/contacts/custom-fields`, {
        fieldName: newFieldName,
        fieldType: newFieldType,
      });
      setNewFieldName('');
      setNewFieldType(FIELD_TYPE_TEXT);
      setShowAddCustomField(false);
      fetchCustomFieldDefs();
      fetchContact();
    } catch (err) {
      console.error('Failed to add custom field:', err);
    }
  };

  const getTypeConfig = (typeName: string | null | undefined): ContactTypeConfig | undefined => {
    if (!typeName) {
      return undefined;
    }
    return contactTypes.find(ct => ct.name === typeName);
  };

  return {
    handleUpdateField,
    handleAddNote,
    handleDeleteNote,
    handleSetCustomFieldValue,
    handleAddCustomField,
    getTypeConfig,
  };
}
