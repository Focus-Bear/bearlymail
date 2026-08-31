import { useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

/** Fallback appended server-side when the user has no signature configured. */
export const DEFAULT_EMAIL_SIGNATURE = 'Sent from BearlyMail (anti inbox overwhelm system)';

/**
 * Returns the user's saved email signature (falling back to the default), so
 * composers can show the exact signature that will be appended on send. Kept in
 * a small hook rather than the auth context because the signature isn't part of
 * the auth payload — it comes from the profile (`GET /users/me`).
 */
export const useEmailSignature = (): string => {
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

  return signature;
};
