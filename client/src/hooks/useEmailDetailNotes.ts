import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from 'config/api';
import { theme } from 'theme/theme';
import { SHORT_TIMEOUT_MS } from 'constants/numbers';

export function useEmailDetailNotes(email: { threadId: string } | null) {
  const [noteContent, setNoteContent] = useState('');
  const [notesCollapsed, setNotesCollapsed] = useState(true);

  const fetchNote = useCallback(async () => {
    if (!email?.threadId) return;
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
    if (!email) return;
    try {
      await axios.post(`${API_URL}/notes/thread/${email.threadId}`, { content: noteContent });
      await fetchNote();
      const button = document.querySelector('[data-save-note-button]') as HTMLElement;
      if (button) {
        const originalText = button.textContent;
        button.textContent = '✓ Saved';
        button.style.backgroundColor = theme.colors.success.main;
        setTimeout(() => {
          button.textContent = originalText;
          button.style.backgroundColor = theme.colors.primary.main;
        }, SHORT_TIMEOUT_MS);
      }
    } catch (error) {
      console.error('Error saving note:', error);
      alert('Failed to save note. Please try again.');
    }
  }, [email, noteContent, fetchNote]);

  return {
    noteContent,
    setNoteContent,
    notesCollapsed,
    setNotesCollapsed,
    handleSaveNote,
  };
}


