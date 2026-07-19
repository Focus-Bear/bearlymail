/**
 * useUserProfileQuery — Wave 1 static endpoint
 *
 * Replaces 4 independent callers of GET /users/me:
 *  1. AuthContext — uses its own refreshUser pattern (not replaced here)
 *  2. useSettingsData — fetches user settings
 *  3. settings/useToneRules — reads user tone rules
 *  4. settings/useApiKeys — reads user API keys
 *
 * Note: AuthContext.refreshUser() is the authoritative source for user identity
 * and is NOT replaced by this query. This hook is for read-only settings
 * consumers that need user profile data.
 *
 * Introduced in: plan #1225 / PR #1236 — Wave 1
 */

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

import { API_URL } from 'config/api';

import { STALE_TIME_5_MIN } from './constants';
import { settingsKeys } from './queryKeys';

// Matches the User type in AuthContext but kept local to avoid circular deps
export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  needsRelogin?: boolean;
  hasSeenTour?: boolean;
  hasScannedHistory?: boolean;
  /** True when the initial sync skipped older mail (cap/window) — shows the inbox banner. */
  syncWindowLimited?: boolean;
  isAdmin?: boolean;
  isApproved?: boolean;
  termsAcceptedAt?: string;
  privacyAcceptedAt?: string;
  termsVersion?: string;
  privacyVersion?: string;
  // Settings-specific fields
  openAiKey?: string;
  anthropicKey?: string;
  /** True when the server has an Anthropic key stored (never returns the raw key). */
  hasAnthropicKey?: boolean;
  /** GitHub OAuth token presence flag or raw token (server-controlled). */
  githubToken?: string | null;
  /** OpenAI API key (write-only; server never returns the raw value). */
  openAiApiKey?: string | null;
  /** Tone rules configuration stored by the user. */
  toneSettings?: {
    rules?: string[];
  };
  toneRules?: string;
  [key: string]: unknown;
}

async function fetchUserProfile(): Promise<UserProfile> {
  const response = await axios.get<UserProfile>(`${API_URL}/users/me`);
  return response.data;
}

/**
 * Returns the current user's profile.
 * 5-minute stale time — user profile rarely changes mid-session.
 */
export function useUserProfileQuery() {
  return useQuery({
    queryKey: settingsKeys.userProfile,
    queryFn: fetchUserProfile,
    staleTime: STALE_TIME_5_MIN,
  });
}
