import { MS_PER_MINUTE } from 'constants/numbers';

/**
 * When the user left onboarding with the rest of the inbox still sorting in the
 * background. The inbox shows that progress until it finishes; localStorage so
 * a reload or a second tab keeps showing it.
 */
const BACKGROUND_SORTING_STARTED_AT_KEY = 'bearlymail_backgroundSortingStartedAt';

/** Stop showing background progress after this long, so a thread that never settles can't pin the banner. */
export const BACKGROUND_SORTING_MAX_WATCH_MINUTES = 30;
const BACKGROUND_SORTING_MAX_WATCH_MS = BACKGROUND_SORTING_MAX_WATCH_MINUTES * MS_PER_MINUTE;

export function markBackgroundSortingStarted(now: number = Date.now()): void {
  try {
    localStorage.setItem(BACKGROUND_SORTING_STARTED_AT_KEY, String(now));
  } catch {
    // Best-effort: without storage the inbox just doesn't show the progress bar.
  }
}

export function clearBackgroundSorting(): void {
  try {
    localStorage.removeItem(BACKGROUND_SORTING_STARTED_AT_KEY);
  } catch {
    // Best-effort.
  }
}

/** True while onboarding's background sort is recent enough to still be worth showing. */
export function isWatchingBackgroundSorting(now: number = Date.now()): boolean {
  try {
    const startedAt = Number(localStorage.getItem(BACKGROUND_SORTING_STARTED_AT_KEY));
    return Number.isFinite(startedAt) && startedAt > 0 && now - startedAt < BACKGROUND_SORTING_MAX_WATCH_MS;
  } catch {
    return false;
  }
}
