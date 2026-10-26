import { ROUTE_SETTINGS } from 'constants/strings';

/** Settings anchor for the suggested auto-archive rules panel (inside Workflows). */
export const AUTO_ARCHIVE_PROPOSALS_SETTINGS_ANCHOR = 'auto-archive-proposals';

export const AUTO_ARCHIVE_PROPOSALS_SETTINGS_PATH = `${ROUTE_SETTINGS}#${AUTO_ARCHIVE_PROPOSALS_SETTINGS_ANCHOR}`;

/**
 * Per-user localStorage key prefix holding the proposal ids the inbox notice was
 * last dismissed for, so it only comes back when a new suggestion arrives.
 */
export const AUTO_ARCHIVE_NOTICE_DISMISSED_KEY_PREFIX = 'bearlymail_auto_archive_notice_dismissed_';
