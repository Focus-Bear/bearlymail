export const MAX_ADDITIONAL_GUESTS = 10;

/** How far ahead a visitor may book or move a meeting. */
export const MAX_BOOKING_HORIZON_DAYS = 180;
export const MAX_GUEST_NAME_LENGTH = 200;
export const MAX_GUEST_EMAIL_LENGTH = 254;

const BOOKING_WRITES_PER_WINDOW = 10;
const BOOKING_WINDOW_MINUTES = 10;
const MS_PER_MINUTE = 60_000;

/** Per-IP limit on the unauthenticated book / reschedule / cancel endpoints. */
export const PUBLIC_BOOKING_THROTTLE = {
  default: {
    limit: BOOKING_WRITES_PER_WINDOW,
    ttl: BOOKING_WINDOW_MINUTES * MS_PER_MINUTE,
  },
} as const;

const SLOT_READS_PER_WINDOW = 60;

/**
 * Per-IP limit on the unauthenticated slots endpoint. Every read hits the
 * host's calendar API, so it is capped too, more loosely than writes because
 * a visitor pages through "load more".
 */
export const PUBLIC_SLOTS_THROTTLE = {
  default: {
    limit: SLOT_READS_PER_WINDOW,
    ttl: BOOKING_WINDOW_MINUTES * MS_PER_MINUTE,
  },
} as const;
