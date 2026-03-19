/**
 * Shared stale-time constants for TanStack Query hooks.
 *
 * Using named constants avoids lint/no-magic-numbers violations and
 * makes stale-time intent explicit at each call site.
 *
 * Introduced in: plan #1225 / PR #1236
 */

import { MS_PER_MINUTE } from 'constants/numbers';

/** 1 minute — matches the old INBOX_CACHE_TTL_MS. Used for dynamic endpoints. */
export const STALE_TIME_DEFAULT_MS = MS_PER_MINUTE;

/** 2 minutes — for data that changes infrequently (e.g. contact type assignments). */
export const STALE_TIME_INFREQUENT_MS = 2 * MS_PER_MINUTE;

/** 5 minutes — for near-static data (e.g. configs, connected accounts). */
export const STALE_TIME_STATIC_MS = 5 * MS_PER_MINUTE;
