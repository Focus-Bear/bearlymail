import React from 'react';
import { useTranslation } from 'react-i18next';

import { ComposerAdvisoryBanner } from 'components/email-detail-inline/ComposerAdvisoryBanner';
import { EMOJI_CALENDAR } from 'constants/emojis';

interface CalendarConflictBannerProps {
  /** Advisory message from the pre-send calendar check. Null/undefined = do not render. */
  calendarWarning: string | null | undefined;
}

/**
 * Non-blocking banner shown when the draft mentions a day for a meeting/call with
 * the recipient that does not line up with the user's calendar (e.g. "see you
 * tomorrow" but the only event with them is a week away). Advisory only — the
 * user can fix the date or hold-to-send anyway.
 */
export const CalendarConflictBanner: React.FC<CalendarConflictBannerProps> = ({ calendarWarning }) => {
  const { t } = useTranslation();

  return (
    <ComposerAdvisoryBanner
      message={calendarWarning}
      emoji={EMOJI_CALENDAR}
      emojiLabel="calendar"
      label={t('emailDetail.calendarConflictLabel', 'Calendar check:')}
    />
  );
};
