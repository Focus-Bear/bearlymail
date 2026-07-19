import { useCallback, useEffect, useState } from 'react';

import { STRING_TRUE } from 'constants/strings';

const DEBUG_VIEW_OPEN_KEY = 'bearlymail:debugViewOpen';
// Same-document sync: the storage event only fires in other tabs, so we also
// broadcast a custom event so live instances in this tab (bug icon, inline
// category panels) update together.
const DEBUG_VIEW_OPEN_EVENT = 'bearlymail:debugViewOpenChange';

const readDebugViewOpen = (): boolean => {
  try {
    return localStorage.getItem(DEBUG_VIEW_OPEN_KEY) === STRING_TRUE;
  } catch {
    return false;
  }
};

/**
 * Master switch for admin debug panels, toggled by the 🐛 bug icon in the inbox header.
 * Backed by localStorage so it applies across pages (inbox, email detail) and tabs.
 * Distinct from useDebugMode, which is the end-user troubleshooting toggle in Settings.
 *
 * @returns { debugViewOpen, setDebugViewOpen }
 */
export const useDebugViewOpen = (): {
  debugViewOpen: boolean;
  setDebugViewOpen: (value: boolean) => void;
} => {
  const [debugViewOpen, setDebugViewOpenState] = useState<boolean>(readDebugViewOpen);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === DEBUG_VIEW_OPEN_KEY) {
        setDebugViewOpenState(event.newValue === STRING_TRUE);
      }
    };
    const handleCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      if (customEvent.detail !== undefined) {
        setDebugViewOpenState(customEvent.detail);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(DEBUG_VIEW_OPEN_EVENT, handleCustomEvent);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(DEBUG_VIEW_OPEN_EVENT, handleCustomEvent);
    };
  }, []);

  const setDebugViewOpen = useCallback((value: boolean) => {
    try {
      localStorage.setItem(DEBUG_VIEW_OPEN_KEY, String(value));
    } catch {
      // localStorage unavailable — proceed in-memory only
    }
    setDebugViewOpenState(value);
    window.dispatchEvent(new CustomEvent(DEBUG_VIEW_OPEN_EVENT, { detail: value }));
  }, []);

  return { debugViewOpen, setDebugViewOpen };
};
