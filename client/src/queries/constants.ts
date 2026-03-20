/**
 * Shared timing constants for TanStack Query configuration.
 *
 * All stale-time and gc-time values live here so they can be imported
 * by both the QueryProvider default options and individual query hooks.
 *
 * Introduced in: plan #1225 / PR #1236
 */

import { MS_PER_MINUTE } from 'constants/numbers';

/** 1-minute stale time — used for dynamic data like inbox summaries. */
export const STALE_TIME_1_MIN = MS_PER_MINUTE;

/** 2-minute stale time — used for semi-static data like contact-type assignments. */
export const STALE_TIME_2_MIN = 2 * MS_PER_MINUTE;

/** 5-minute stale time — used for near-static data like contact configs and user profile. */
export const STALE_TIME_5_MIN = 5 * MS_PER_MINUTE;

/** Default garbage-collection time for inactive queries (5 minutes). */
export const GC_TIME_DEFAULT = 5 * MS_PER_MINUTE;
