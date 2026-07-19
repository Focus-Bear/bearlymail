import { useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';

/**
 * Subset of /github/my/connection-status the inbox cards actually use to
 * gate the "Connect for CI status" prompt.
 */
export interface GitHubConnectionStatus {
  hasToken: boolean;
  tokenValid?: boolean;
  hasRepoScope: boolean;
}

const FALLBACK_STATUS: GitHubConnectionStatus = {
  hasToken: false,
  hasRepoScope: false,
};

/**
 * Module-level singleton — the connection status changes rarely (only on
 * connect / disconnect / scope upgrade), so refetching per card render is
 * wasteful. The first hook call kicks off the fetch; subsequent calls in the
 * same session resolve from the cached promise.
 */
let cachedStatusPromise: Promise<GitHubConnectionStatus> | null = null;

function loadGitHubConnectionStatus(): Promise<GitHubConnectionStatus> {
  if (cachedStatusPromise) {
    return cachedStatusPromise;
  }
  cachedStatusPromise = axios
    .get<GitHubConnectionStatus>(`${API_URL}/github/my/connection-status`)
    .then(response => ({
      hasToken: response.data.hasToken ?? false,
      tokenValid: response.data.tokenValid,
      hasRepoScope: response.data.hasRepoScope ?? false,
    }))
    .catch(() => FALLBACK_STATUS);
  return cachedStatusPromise;
}

/**
 * Test-only: clear the module-level cache. Production code should never
 * call this — refresh-after-reauth is handled by full-page navigation.
 */
export function _resetGitHubConnectionStatusCache(): void {
  cachedStatusPromise = null;
}

/**
 * Returns the cached GitHub connection status, or null while loading.
 * Designed for inline UI hints (e.g. "Connect for CI status" on PR cards) —
 * not for blocking renders.
 */
export function useGitHubConnectionStatus(): GitHubConnectionStatus | null {
  const [status, setStatus] = useState<GitHubConnectionStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGitHubConnectionStatus().then(result => {
      if (!cancelled) {
        setStatus(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
