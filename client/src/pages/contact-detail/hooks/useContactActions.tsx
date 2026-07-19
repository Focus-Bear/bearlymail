import axios from 'axios';

import { API_URL } from 'config/api';

export function useContactActions(contactId?: string, onUpdated?: () => void) {
  const handleUpdateField = async (field: string, value: string | null) => {
    if (!contactId) {
      return;
    }
    try {
      await axios.put(`${API_URL}/contacts/${contactId}`, { [field]: value });
      onUpdated && onUpdated();
    } catch (err) {
      console.error('Failed to update contact:', err);
    }
  };

  const handleAddNote = async (content: string, onDone?: () => void) => {
    if (!contactId || !content.trim()) {
      return;
    }
    try {
      await axios.post(`${API_URL}/contacts/${contactId}/notes`, { content });
      onDone && onDone();
      onUpdated && onUpdated();
    } catch (err) {
      console.error('Failed to add note:', err);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!contactId) {
      return;
    }
    try {
      await axios.delete(`${API_URL}/contacts/${contactId}/notes/${noteId}`);
      onUpdated && onUpdated();
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
      onUpdated && onUpdated();
    } catch (err) {
      console.error('Failed to set custom field value:', err);
    }
  };

  const handleAddCustomField = async (fieldName: string, fieldType: string, onDone?: () => void) => {
    if (!fieldName.trim()) {
      return;
    }
    try {
      await axios.post(`${API_URL}/contacts/custom-fields`, {
        fieldName,
        fieldType,
      });
      onDone && onDone();
      onUpdated && onUpdated();
    } catch (err) {
      console.error('Failed to add custom field:', err);
    }
  };

  return { handleUpdateField, handleAddNote, handleDeleteNote, handleSetCustomFieldValue, handleAddCustomField };
}

export default useContactActions;
