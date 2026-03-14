import { useCallback, useEffect, useState } from 'react';

import { STRING_TRUE } from 'constants/strings';

const DEBUG_MODE_KEY = 'bearlymail:debugMode';

/**
 * Hook to read/write debug (troubleshooting) mode from localStorage.
 * Broadcasts changes via the storage event so multiple tabs stay in sync.
 *
 * @returns { isDebugModeEnabled, setDebugModeEnabled }
 */
export const useDebugMode = (): {
  isDebugModeEnabled: boolean;
  setDebugModeEnabled: (value: boolean) => void;
} => {
  const [isDebugModeEnabled, setIsDebugModeEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DEBUG_MODE_KEY) === STRING_TRUE;
    } catch {
      return false;
    }
  });

  // Listen for changes in other tabs
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === DEBUG_MODE_KEY) {
        setIsDebugModeEnabled(event.newValue === STRING_TRUE);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const setDebugModeEnabled = useCallback((value: boolean) => {
    try {
      localStorage.setItem(DEBUG_MODE_KEY, String(value));
    } catch {
      // localStorage unavailable — proceed in-memory only
    }
    setIsDebugModeEnabled(value);
  }, []);

  return { isDebugModeEnabled, setDebugModeEnabled };
};
