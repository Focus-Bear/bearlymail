import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';

import { EMOJI_CLOSE, EMOJI_INFO } from 'constants/emojis';
import { OPEN_TRACKING_SETTINGS_ANCHOR } from 'constants/openTracking';

export const OPEN_TRACKING_NOTICE_DISMISSED_KEY_PREFIX = 'bearlymail_open_tracking_notice_dismissed_';
const DISMISSED_VALUE = 'true';

interface OpenTrackingNoticeBannerProps {
  /** Current user id — dismissal is persisted per user in localStorage. */
  userId?: string;
  /** The account's open-tracking setting; nothing to announce when it's off. */
  trackEmailOpens?: boolean;
  /** Held back until the tour is done so it never stacks on a new user's first inbox. */
  hasSeenTour?: boolean;
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
 * One-time inbox notice that open tracking is on. Tracking ships on by default,
 * so existing users would otherwise start sending tracked mail without being
 * told; this tells them once and links to the setting. Dismissing it, or
 * following the link, hides it for good (persisted per user in localStorage).
 */
export const OpenTrackingNoticeBanner: React.FC<OpenTrackingNoticeBannerProps> = ({
  userId,
  trackEmailOpens,
  hasSeenTour,
}) => {
  const { t } = useTranslation();
  const storageKey = userId ? `${OPEN_TRACKING_NOTICE_DISMISSED_KEY_PREFIX}${userId}` : null;
  const [isDismissed, setIsDismissed] = useState(() => readDismissed(storageKey));
  const [prevStorageKey, setPrevStorageKey] = useState(storageKey);

  // Re-read the stored dismissal when the user changes (auth finishing after
  // mount, or an account switch) so the initial useState snapshot doesn't go stale.
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

  if (!userId || trackEmailOpens !== true || hasSeenTour !== true || isDismissed) {
    return null;
  }

  return (
    <div
      role="status"
      data-testid="open-tracking-notice-banner"
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
        {EMOJI_INFO} {t('inbox.openTrackingNotice.message')}{' '}
        <Link
          to={`/settings#${OPEN_TRACKING_SETTINGS_ANCHOR}`}
          onClick={dismiss}
          style={{ color: theme.colors.primary.main }}
        >
          {t('inbox.openTrackingNotice.manage')}
        </Link>
      </span>
      <button
        onClick={dismiss}
        aria-label={t('inbox.openTrackingNotice.dismiss')}
        title={t('inbox.openTrackingNotice.dismiss')}
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
