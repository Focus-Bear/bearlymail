/**
 * Hand-off slot for a composed message that failed to send in the background.
 *
 * The user has already been routed away from the composer by the time the
 * failure event arrives, so the fields are parked here and the Compose page
 * picks them up when Retry brings the user back. Attachments cannot survive the
 * round-trip (File objects are not serialisable) and must be re-added.
 */

const STORAGE_KEY = 'bearlymail.composeRestore';

export interface ComposeRestorePayload {
  to: { email: string; name?: string }[];
  cc: { email: string; name?: string }[];
  bcc: { email: string; name?: string }[];
  subject: string;
  body: string;
}

export function stashComposeRestore(payload: ComposeRestorePayload): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage blocked — the user keeps the error toast, just not the prefill.
  }
}

/** Reads and clears the parked message, so a later visit starts blank. */
export function takeComposeRestore(): ComposeRestorePayload | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    window.sessionStorage.removeItem(STORAGE_KEY);
    return JSON.parse(raw) as ComposeRestorePayload;
  } catch {
    return null;
  }
}
