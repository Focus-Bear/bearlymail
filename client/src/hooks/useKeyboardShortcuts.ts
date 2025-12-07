import { useEffect, useCallback } from 'react';
import { Email } from '../types/email';

interface UseKeyboardShortcutsProps {
  emails: Email[];
  selectedEmailIndex: number;
  selectedEmailIds: Set<string>;
  setSelectedEmailIndex: (index: number) => void;
  onArchive: (emailId: string, e: React.MouseEvent) => void;
  onSetStarCount: (emailId: string, starCount: number) => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  emails,
  selectedEmailIndex,
  selectedEmailIds,
  setSelectedEmailIndex,
  onArchive,
  onSetStarCount,
  enabled = true,
}: UseKeyboardShortcutsProps): void {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Arrow navigation
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      const newIndex = Math.min(selectedEmailIndex + 1, emails.length - 1);
      setSelectedEmailIndex(newIndex);
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      const newIndex = Math.max(selectedEmailIndex - 1, 0);
      setSelectedEmailIndex(newIndex);
    }

    // Star shortcuts (1, 2, 3)
    if (['1', '2', '3'].includes(e.key) && selectedEmailIds.size > 0) {
      e.preventDefault();
      const starCount = parseInt(e.key);
      selectedEmailIds.forEach(emailId => {
        onSetStarCount(emailId, starCount);
      });
    }

    // Archive (Delete, Backspace, or 'e')
    if ((e.key === 'Delete' || e.key === 'Backspace' || e.key === 'e') && selectedEmailIds.size > 0) {
      e.preventDefault();
      const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
      selectedEmailIds.forEach(emailId => {
        onArchive(emailId, fakeEvent);
      });
    }

    // Clear star (0)
    if (e.key === '0' && selectedEmailIds.size > 0) {
      e.preventDefault();
      selectedEmailIds.forEach(emailId => {
        onSetStarCount(emailId, 0);
      });
    }
  }, [emails, selectedEmailIndex, selectedEmailIds, setSelectedEmailIndex, onArchive, onSetStarCount]);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}
