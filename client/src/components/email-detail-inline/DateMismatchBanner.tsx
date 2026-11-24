import React from 'react';
import { useTranslation } from 'react-i18next';

import { ComposerAdvisoryBanner } from 'components/email-detail-inline/ComposerAdvisoryBanner';
import { EMOJI_CALENDAR } from 'constants/emojis';

interface DateMismatchBannerProps {
  /** Warning from the pre-send weekday/date check. Null/undefined = do not render. */
  dateMismatch: string | null | undefined;
}

/**
 * Banner shown when the draft pairs a weekday with a date that falls on a
 * different day (e.g. "Tuesday 7th December" when the 7th is a Monday). Pauses
 * the send like a failed tone check; the user can fix the date or hold-to-send.
 */
export const DateMismatchBanner: React.FC<DateMismatchBannerProps> = ({ dateMismatch }) => {
  const { t } = useTranslation();

  return (
    <ComposerAdvisoryBanner
      message={dateMismatch}
      emoji={EMOJI_CALENDAR}
      emojiLabel="date"
      label={t('emailDetail.dateMismatchLabel')}
    />
  );
};
