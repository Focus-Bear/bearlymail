import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_CLOSE, EMOJI_INFO } from 'constants/emojis';

export const SYNC_WINDOW_BANNER_DISMISSED_KEY_PREFIX = 'bearlymail_sync_window_banner_dismissed_';
const DISMISSED_VALUE = 'true';

interface SyncWindowBannerProps {
  /** Current user id — dismissal is persisted per user in localStorage. */
  userId?: string;
  /** Server flag: the initial sync skipped older mail (500-email cap / 7-day window). */
  syncWindowLimited?: boolean;
}

function readDismissed(storageKey: string | null): boolean {
  if (!storageKey) {
    return false;
  }
  try {
    return localStorage.getItem(storageKey) === DISMISSED_VALUE;
  } catch {
    return false;
  }
}

/**
 * Dismissible inbox banner telling the user that older mail isn't being synced
 * (sync-window policy: 500 most recent on the initial sync, then a 7-day
 * window plus starred). Shown while `user.syncWindowLimited` is set and the
 * user hasn't dismissed it; dismissal persists per user in localStorage.
 */
export const SyncWindowBanner: React.FC<SyncWindowBannerProps> = ({ userId, syncWindowLimited }) => {
  const { t } = useTranslation();
  const storageKey = userId ? `${SYNC_WINDOW_BANNER_DISMISSED_KEY_PREFIX}${userId}` : null;
  const [isDismissed, setIsDismissed] = useState(() => readDismissed(storageKey));
  const [prevStorageKey, setPrevStorageKey] = useState(storageKey);

  // Re-read the stored dismissal when the user changes (auth finishing after
  // mount, or an account switch) — React's "adjusting state when props change"
  // pattern, so the initial useState snapshot doesn't go stale.
  if (storageKey !== prevStorageKey) {
    setPrevStorageKey(storageKey);
    setIsDismissed(readDismissed(storageKey));
  }

  const dismiss = useCallback(() => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, DISMISSED_VALUE);
      } catch {
        // Storage unavailable — the banner still hides for this session
      }
    }
    setIsDismissed(true);
  }, [storageKey]);

  if (!syncWindowLimited || !userId || isDismissed) {
    return null;
  }

  return (
    <div
      role="status"
      data-testid="sync-window-banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        margin: `${theme.spacing.sm} ${theme.spacing.md} 0`,
        backgroundColor: theme.colors.background.subtle,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.secondary,
      }}
    >
      <span>
        {EMOJI_INFO} {t('inbox.syncWindowBanner.message')}
      </span>
      <button
        onClick={dismiss}
        aria-label={t('inbox.syncWindowBanner.dismiss')}
        title={t('inbox.syncWindowBanner.dismiss')}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: theme.spacing.xs,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        {EMOJI_CLOSE}
      </button>
    </div>
  );
};
