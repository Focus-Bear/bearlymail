import { useEffect, useCallback } from 'react';
import { Email } from 'types/email';
import { KEY_ARROW_DOWN, KEY_ARROW_UP, KEY_J, KEY_K, KEY_DELETE, KEY_BACKSPACE, KEY_E } from 'constants/strings';

interface UseKeyboardShortcutsProps {
  emails: Email[];
  selectedEmailIndex: number;
  selectedEmailIds: Set<string>;
  setSelectedEmailIndex: (index: number) => void;
  onArchive: (emailId: string, e: React.MouseEvent) => void;
  onSetStarCount: (emailId: string, starCount: number) => void;
  enabled?: boolean;
  emailListRef?: React.RefObject<HTMLDivElement | null>;
  emailDetailRef?: React.RefObject<HTMLDivElement | null>;
  splitViewSelectedEmailId?: string | null;
}

export function useKeyboardShortcuts({
  emails,
  selectedEmailIndex,
  selectedEmailIds,
  setSelectedEmailIndex,
  onArchive,
  onSetStarCount,
  enabled = true,
  emailListRef,
  emailDetailRef,
  splitViewSelectedEmailId,
}: UseKeyboardShortcutsProps): void {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Filter out archived emails to match visible list
    const visibleEmails = emails.filter(email => !email.isArchived);

    // Arrow navigation
    if (e.key === KEY_ARROW_DOWN || e.key === KEY_J) {
      e.preventDefault();
      const newIndex = Math.min(selectedEmailIndex + 1, visibleEmails.length - 1);
      setSelectedEmailIndex(newIndex);
      // Scroll the newly selected email into view
      if (emailListRef?.current) {
        setTimeout(() => {
          const emailElement = emailListRef.current?.querySelector(
            `[data-email-index="${newIndex}"]`
          ) as HTMLElement;
          if (emailElement) {
            emailElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 0);
      }
    } else if (e.key === KEY_ARROW_UP || e.key === KEY_K) {
      e.preventDefault();
      const newIndex = Math.max(selectedEmailIndex - 1, 0);
      setSelectedEmailIndex(newIndex);
      // Scroll the newly selected email into view
      if (emailListRef?.current) {
        setTimeout(() => {
          const emailElement = emailListRef.current?.querySelector(
            `[data-email-index="${newIndex}"]`
          ) as HTMLElement;
          if (emailElement) {
            emailElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 0);
      }
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
    if (e.key === KEY_DELETE || e.key === KEY_BACKSPACE || e.key === KEY_E) {
      // If split view is open with an email, archive that email regardless of focus location
      if (splitViewSelectedEmailId) {
        e.preventDefault();
        const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
        onArchive(splitViewSelectedEmailId, fakeEvent);
        return;
      }
      
      // If there are checked emails, archive all of them
      if (selectedEmailIds.size > 0) {
        e.preventDefault();
        const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
        selectedEmailIds.forEach(emailId => {
          onArchive(emailId, fakeEvent);
        });
      } 
      // Otherwise, if there's a highlighted email, archive that one
      else if (selectedEmailIndex >= 0 && selectedEmailIndex < visibleEmails.length) {
        e.preventDefault();
        const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
        const emailToArchive = visibleEmails[selectedEmailIndex];
        if (emailToArchive) {
          onArchive(emailToArchive.id, fakeEvent);
          // Adjust selected index after archiving (move to previous email or stay at current position)
          if (selectedEmailIndex > 0) {
            setSelectedEmailIndex(selectedEmailIndex - 1);
          } else if (visibleEmails.length > 1) {
            // If we archived the first email, stay at index 0 (which will now be the next email)
            setSelectedEmailIndex(0);
          } else {
            // No more emails, reset index
            setSelectedEmailIndex(-1);
          }
        }
      }
    }

    // Clear star (0)
    if (e.key === '0' && selectedEmailIds.size > 0) {
      e.preventDefault();
      selectedEmailIds.forEach(emailId => {
        onSetStarCount(emailId, 0);
      });
    }
  }, [emails, selectedEmailIndex, selectedEmailIds, setSelectedEmailIndex, onArchive, onSetStarCount, emailListRef, emailDetailRef, splitViewSelectedEmailId]);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}
