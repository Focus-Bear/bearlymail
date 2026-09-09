import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { ExpectedReplyRow } from 'components/email-detail-inline/ExpectedReplyRow';

interface ComposeFollowUpSectionProps {
  followUpDuration: string;
  disabled: boolean;
  tooltipText: string;
  onChange: (value: string) => void;
}

/**
 * "Expect a reply within …" block on the compose page, sitting between the
 * message body and the send buttons. Wraps the same control the reply composer
 * uses so both composers behave identically: the field is pre-filled with the
 * default window, and clearing it means no follow-up.
 */
export const ComposeFollowUpSection: React.FC<ComposeFollowUpSectionProps> = ({
  followUpDuration,
  disabled,
  tooltipText,
  onChange,
}) => {
  const { t } = useTranslation();

  return (
    <section
      aria-label={t('compose.followUpSection')}
      data-testid="compose-follow-up-section"
      style={{
        marginTop: theme.spacing.md,
        padding: theme.spacing.md,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.background.subtle,
      }}
    >
      <ExpectedReplyRow
        followUpDuration={followUpDuration}
        disabled={disabled}
        tooltipText={tooltipText}
        onChange={onChange}
      />
    </section>
  );
};
