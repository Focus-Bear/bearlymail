import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

export function useEmailDetailNotes(email: { threadId: string } | null) {
  const [noteContent, setNoteContent] = useState('');
  const [notesCollapsed, setNotesCollapsed] = useState(true);

  const fetchNote = useCallback(async () => {
    if (!email?.threadId) {
      return;
    }
    try {
      const response = await axios.get(`${API_URL}/notes/thread/${email.threadId}`);
      if (response.data) {
        setNoteContent(response.data.content);
        setNotesCollapsed(false);
      } else {
        setNotesCollapsed(true);
      }
    } catch (error) {
      setNotesCollapsed(true);
    }
  }, [email?.threadId]);

  useEffect(() => {
    if (email?.threadId) {
      fetchNote();
    }
  }, [email?.threadId, fetchNote]);

  const handleSaveNote = useCallback(async () => {
    if (!email) {
      return;
    }
    try {
      await axios.post(`${API_URL}/notes/thread/${email.threadId}`, { content: noteContent });
    } catch (error) {
      console.error('Error saving note:', error);
    }
  }, [email, noteContent]);

  return {
    noteContent,
    setNoteContent,
    notesCollapsed,
    setNotesCollapsed,
    handleSaveNote,
  };
}
