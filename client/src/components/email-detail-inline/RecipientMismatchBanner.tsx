import React from 'react';
import { useTranslation } from 'react-i18next';

import { ComposerAdvisoryBanner } from 'components/email-detail-inline/ComposerAdvisoryBanner';
import { EMOJI_USER } from 'constants/emojis';

interface RecipientMismatchBannerProps {
  /** Advisory message from the pre-send copy-paste check. Null/undefined = do not render. */
  recipientMismatch: string | null | undefined;
}

/**
 * Non-blocking banner for a likely copy-paste error: the draft greets a person
 * or names an organisation that does not match who it is addressed to (e.g.
 * "Hi Peter" going to Rob, or "University of Canberra" going to a @usyd.edu.au
 * address). Advisory only — the user can fix it or send anyway.
 */
export const RecipientMismatchBanner: React.FC<RecipientMismatchBannerProps> = ({ recipientMismatch }) => {
  const { t } = useTranslation();

  return (
    <ComposerAdvisoryBanner
      message={recipientMismatch}
      emoji={EMOJI_USER}
      emojiLabel="recipient"
      label={t('emailDetail.recipientMismatchLabel')}
    />
  );
};
