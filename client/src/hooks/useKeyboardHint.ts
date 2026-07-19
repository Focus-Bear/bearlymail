import { useCallback, useState } from 'react';

interface KeyboardHint {
  emailId: string;
  action: string;
}

interface UseKeyboardHintReturn {
  showKeyboardHint: KeyboardHint | null;
  setShowKeyboardHint: React.Dispatch<React.SetStateAction<KeyboardHint | null>>;
  showHint: (emailId: string, action: string) => void;
  hideHint: () => void;
}

export function useKeyboardHint(): UseKeyboardHintReturn {
  const [showKeyboardHint, setShowKeyboardHint] = useState<KeyboardHint | null>(null);

  const showHint = useCallback((emailId: string, action: string) => {
    setShowKeyboardHint({ emailId, action });
  }, []);

  const hideHint = useCallback(() => {
    setShowKeyboardHint(null);
  }, []);

  return {
    showKeyboardHint,
    setShowKeyboardHint,
    showHint,
    hideHint,
  };
}
