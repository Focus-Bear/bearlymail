import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_CALENDAR } from 'constants/emojis';

interface CalendarConflictBannerProps {
  /** Advisory message from the pre-send calendar check. Null/undefined = do not render. */
  calendarWarning: string | null | undefined;
}

/**
 * Non-blocking banner shown when the draft mentions a day for a meeting/call with
 * the recipient that does not line up with the user's calendar (e.g. "see you
 * tomorrow" but the only event with them is a week away). Advisory only — the
 * user can fix the date or hold-to-send anyway. Rendered separately from the tone
 * check so it stays visible regardless of whether the tone check passed.
 */
export const CalendarConflictBanner: React.FC<CalendarConflictBannerProps> = ({ calendarWarning }) => {
  const { t } = useTranslation();

  if (!calendarWarning) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.sunray.light4,
        border: `1px solid ${theme.colors.accent.warning ?? theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.sm,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.primary,
        display: 'flex',
        alignItems: 'flex-start',
        gap: theme.spacing.xs,
      }}
    >
      <span role="img" aria-label="calendar">
        {EMOJI_CALENDAR}
      </span>
      <span>
        <strong>{t('emailDetail.calendarConflictLabel', 'Calendar check:')}</strong> {calendarWarning}
      </span>
    </div>
  );
};
