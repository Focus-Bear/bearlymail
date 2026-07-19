import { useCallback, useState } from 'react';

interface UseSnoozeInputReturn {
  snoozeInput: { [key: string]: string };
  showSnoozeInput: string | null;
  setSnoozeInput: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  setShowSnoozeInput: React.Dispatch<React.SetStateAction<string | null>>;
  getSnoozeValue: (emailId: string) => string;
  setSnoozeValue: (emailId: string, value: string) => void;
  showSnooze: (emailId: string) => void;
  hideSnooze: () => void;
  clearSnooze: (emailId: string) => void;
}

export function useSnoozeInput(): UseSnoozeInputReturn {
  const [snoozeInput, setSnoozeInput] = useState<{ [key: string]: string }>({});
  const [showSnoozeInput, setShowSnoozeInput] = useState<string | null>(null);

  const getSnoozeValue = useCallback(
    (emailId: string) => {
      return snoozeInput[emailId] || '';
    },
    [snoozeInput]
  );

  const setSnoozeValue = useCallback((emailId: string, value: string) => {
    setSnoozeInput(prev => ({ ...prev, [emailId]: value }));
  }, []);

  const showSnooze = useCallback((emailId: string) => {
    setShowSnoozeInput(emailId);
  }, []);

  const hideSnooze = useCallback(() => {
    setShowSnoozeInput(null);
  }, []);

  const clearSnooze = useCallback((emailId: string) => {
    setSnoozeInput(prev => {
      const next = { ...prev };
      delete next[emailId];
      return next;
    });
    setShowSnoozeInput(null);
  }, []);

  return {
    snoozeInput,
    showSnoozeInput,
    setSnoozeInput,
    setShowSnoozeInput,
    getSnoozeValue,
    setSnoozeValue,
    showSnooze,
    hideSnooze,
    clearSnooze,
  };
}
