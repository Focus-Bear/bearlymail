import type { FocusBearConnectionMethod } from "../constants/focus-bear.constants";

/** `POST …/suggest-project` on the Focus Bear API. */
export interface FocusBearProjectOption {
  id: string;
  name: string;
}

export interface FocusBearProjectSuggestionResponse {
  project: (FocusBearProjectOption & { confidence: number }) | null;
  min_confidence: number;
  projects: FocusBearProjectOption[];
}

/** `GET …/next-free-date` on the Focus Bear API. */
export interface FocusBearNextFreeDateResponse {
  date: string | null;
  duration_minutes: number;
  free_minutes: number | null;
  full_working_days: number;
  search_days: number;
  timezone: string;
}

export interface FocusBearTaskToFile {
  title: string;
  description?: string;
  emailSubject?: string;
  sender?: string;
}

/** What "Save to Focus Bear" pre-fills: a suggested project and due date, each null when there is none. */
export interface FocusBearTaskSuggestions {
  connected: boolean;
  project: (FocusBearProjectOption & { confidence: number }) | null;
  projects: FocusBearProjectOption[];
  /** `YYYY-MM-DD` in the user's Focus Bear timezone. */
  dueDate: string | null;
}

export class FocusBearApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FocusBearApiError";
  }
}

/** The token endpoint's JSON for both the code exchange and a refresh. */
export interface FocusBearOAuthTokenResponse {
  access_token: string;
  /** Auth0 rotates refresh tokens: a refresh may return a new one, or none. */
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

/** The connection Settings shows; never the token itself. */
export interface FocusBearConnectionStatus {
  connected: boolean;
  method: FocusBearConnectionMethod | null;
  /** False when this deployment has no Focus Bear OAuth app configured. */
  oauthAvailable: boolean;
}

/** An access token BearlyMail can call Focus Bear with right now, and which kind it is. */
export interface FocusBearCredential {
  method: FocusBearConnectionMethod;
  accessToken: string;
}

export class FocusBearOAuthError extends Error {
  constructor(
    /** The token endpoint's `error`, e.g. `invalid_grant`; null when it sent none. */
    readonly oauthError: string | null,
    message: string,
  ) {
    super(message);
    this.name = "FocusBearOAuthError";
  }
}
