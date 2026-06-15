/**
 * One-time coachmark gating for the Scheduled view.
 *
 * Scheduled emails are reachable from the inbox header ⋮ menu (not the sidebar).
 * The first time a user schedules an email we flag a pending coachmark; the
 * inbox shows it once, anchored to the ⋮ button, then marks it seen so it
 * never reappears.
 */
const PENDING_KEY = 'bearlymail_scheduled_tour_pending';
const SEEN_KEY = 'bearlymail_scheduled_tour_seen';

/**
 * Fired when the pending coachmark flag changes so a mounted inbox can update
 * its coachmark visibility without waiting for a re-mount (e.g. a reply
 * scheduled from the inline email-detail view).
 */
export const SCHEDULED_TOUR_UPDATED_EVENT = 'bearlymail_scheduled_tour_updated';

/** Call after a scheduled email is successfully queued. No-op once seen. */
export function markScheduledEmailSent(): void {
  try {
    if (localStorage.getItem(SEEN_KEY) === '1') {
      return;
    }
    localStorage.setItem(PENDING_KEY, '1');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SCHEDULED_TOUR_UPDATED_EVENT));
    }
  } catch {
    // localStorage unavailable (private mode / SSR) — coachmark is best-effort.
  }
}

/** Whether the inbox should show the Scheduled coachmark now. */
export function shouldShowScheduledTour(): boolean {
  try {
    return localStorage.getItem(PENDING_KEY) === '1' && localStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return false;
  }
}

/** Dismiss the coachmark permanently. */
export function dismissScheduledTour(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // best-effort
  }
}
