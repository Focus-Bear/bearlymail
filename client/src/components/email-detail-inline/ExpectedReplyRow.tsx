import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { InfoTooltip } from './InfoTooltip';

interface ExpectedReplyRowProps {
  followUpDuration: string;
  sending: boolean;
  checkingTone: boolean;
  tooltipText: string;
  onChange: (value: string) => void;
}

/**
 * Row with the "Expect a reply within" free-text input. Accepts the same
 * natural-language syntax as the snooze input ("48h", "3d", "next Monday",
 * "5pm"); leaving it blank means no follow-up.
 */
export const ExpectedReplyRow: React.FC<ExpectedReplyRowProps> = ({
  followUpDuration,
  sending,
  checkingTone,
  tooltipText,
  onChange,
}) => {
  const { t } = useTranslation();
  const isDisabled = sending || checkingTone;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          whiteSpace: 'nowrap',
        }}
      >
        {t('emailDetail.expectedReply.label')}
        <InfoTooltip text={tooltipText} />
      </span>
      <input
        type="text"
        value={followUpDuration}
        onChange={event => onChange(event.target.value)}
        disabled={isDisabled}
        placeholder={t('emailDetail.expectedReply.customPlaceholder')}
        title={t('emailDetail.expectedReply.customTooltip')}
        aria-label={t('emailDetail.expectedReply.label')}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.sm,
          backgroundColor: theme.colors.background.subtle,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.xs,
          width: '150px',
          outline: 'none',
          cursor: isDisabled ? 'not-allowed' : 'text',
        }}
      />
    </div>
  );
};
