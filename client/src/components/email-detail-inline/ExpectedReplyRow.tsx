import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { InfoTooltip } from './InfoTooltip';
import { EXPECTED_REPLY_OPTIONS } from './useReplyComposerFooter';

interface ExpectedReplyRowProps {
  expectedReplyHours: number;
  sending: boolean;
  checkingTone: boolean;
  tooltipText: string;
  getOptionLabel: (option: (typeof EXPECTED_REPLY_OPTIONS)[number]) => string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}

/**
 * Row showing the "Expect a reply within" dropdown with an info tooltip.
 */
export const ExpectedReplyRow: React.FC<ExpectedReplyRowProps> = ({
  expectedReplyHours,
  sending,
  checkingTone,
  tooltipText,
  getOptionLabel,
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
      <select
        value={expectedReplyHours}
        onChange={onChange}
        disabled={isDisabled}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.sm,
          backgroundColor: theme.colors.background.subtle,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.xs,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
        }}
      >
        {EXPECTED_REPLY_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {getOptionLabel(option)}
          </option>
        ))}
      </select>
    </div>
  );
};
