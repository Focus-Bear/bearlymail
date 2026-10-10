import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

/** Fallback appended server-side when the user has no signature configured. */
export const DEFAULT_EMAIL_SIGNATURE = 'Sent from BearlyMail (anti inbox overwhelm system)';

export interface UseEmailSignature {
  /** The signature that will be appended on send (saved value, or the default). */
  signature: string;
  /** Persist a new signature to the profile and update the local value. */
  saveSignature: (next: string) => Promise<void>;
}

/**
 * Reads and updates the user's email signature (falling back to the default), so
 * a composer can both show the exact signature that will be appended on send and
 * edit it inline. Kept in a small hook rather than the auth context because the
 * signature isn't part of the auth payload — it comes from the profile
 * (`GET /users/me`) and saves back via `PUT /users/me`.
 */
export const useEmailSignature = (): UseEmailSignature => {
  const [signature, setSignature] = useState<string>(DEFAULT_EMAIL_SIGNATURE);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API_URL}/users/me`)
      .then(response => {
        if (cancelled) {
          return;
        }
        const stored = (response.data?.emailSignature as string | null | undefined)?.trim();
        setSignature(stored || DEFAULT_EMAIL_SIGNATURE);
      })
      .catch(() => {
        // Keep the default; the server appends it either way.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveSignature = useCallback(async (next: string) => {
    const trimmed = next.trim();
    await axios.put(`${API_URL}/users/me`, { emailSignature: trimmed });
    // Reflect the saved value immediately; an empty save falls back to the default.
    setSignature(trimmed || DEFAULT_EMAIL_SIGNATURE);
  }, []);

  return { signature, saveSignature };
};
