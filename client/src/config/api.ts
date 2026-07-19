/**
 * API base URL. In production, defaults to the same host with "api." subdomain
 * (e.g. app.focusbear.io -> https://api.app.focusbear.io) so one build works for any domain.
 * Set VITE_API_URL at build time to override.
 */
import axios from 'axios';

import { TYPEOF_UNDEFINED } from 'constants/strings';

function getApiUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv && fromEnv.trim() !== '') {
    return fromEnv.trim();
  }
  if (import.meta.env.PROD && typeof window !== TYPEOF_UNDEFINED) {
    return `https://api.${window.location.hostname}`;
  }
  return 'http://localhost:3001';
}

export const API_URL = getApiUrl();

// Send HttpOnly cookies with every cross-origin request (OWASP ASVS GAP-4).
// The JWT is stored in an HttpOnly cookie rather than localStorage to prevent
// XSS-based token theft. withCredentials ensures the browser includes the
// cookie on CORS requests to the API.
axios.defaults.withCredentials = true;
