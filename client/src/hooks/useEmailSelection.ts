import { useCallback, useEffect, useState } from 'react';
import { Email, InboxMode } from 'types/email';

interface UseEmailSelectionReturn {
  selectedEmailIndex: number;
  setSelectedEmailIndex: React.Dispatch<React.SetStateAction<number>>;
  selectedEmailIds: Set<string>;
  setSelectedEmailIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  lastSelectedIndex: number;
  handleEmailClick: (emailId: string, index: number, event: React.MouseEvent, emails: Email[]) => void;
  clearSelection: () => void;
}

export function useEmailSelection(mode: InboxMode, emailsLength: number): UseEmailSelectionReturn {
  const [selectedEmailIndex, setSelectedEmailIndex] = useState<number>(-1);
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);

  // Reset selection when mode or emails change
  useEffect(() => {
    setSelectedEmailIndex(-1);
    setSelectedEmailIds(new Set());
  }, [mode, emailsLength]);

  const handleEmailClick = useCallback(
    (emailId: string, index: number, event: React.MouseEvent, emails: Email[]) => {
      // Handle multi-select with shift key
      if (event.shiftKey && lastSelectedIndex >= 0) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        const newSelected = new Set(selectedEmailIds);
        for (let i = start; i <= end; i++) {
          if (emails[i]) {
            newSelected.add(emails[i].id);
          }
        }
        setSelectedEmailIds(newSelected);
      } else if (event.ctrlKey || event.metaKey) {
        // Handle toggle select with ctrl/cmd key
        setSelectedEmailIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(emailId)) {
            newSet.delete(emailId);
          } else {
            newSet.add(emailId);
          }
          return newSet;
        });
        setLastSelectedIndex(index);
      } else {
        // Regular click - select single
        setSelectedEmailIds(new Set([emailId]));
        setLastSelectedIndex(index);
      }
      setSelectedEmailIndex(index);
    },
    [lastSelectedIndex, selectedEmailIds]
  );

  const clearSelection = useCallback(() => {
    setSelectedEmailIds(new Set());
    setSelectedEmailIndex(-1);
    setLastSelectedIndex(-1);
  }, []);

  return {
    selectedEmailIndex,
    setSelectedEmailIndex,
    selectedEmailIds,
    setSelectedEmailIds,
    lastSelectedIndex,
    handleEmailClick,
    clearSelection,
  };
}
