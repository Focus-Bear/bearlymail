import React, { useState } from 'react';
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
 *
 * When the input is focused, quick-select buttons appear below for common durations.
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
  const [showSuggestions, setShowSuggestions] = useState(false);

  const quickOptions = [
    { label: t('emailDetail.expectedReply.quick48h'), value: '48h' },
    { label: t('emailDetail.expectedReply.quick3d'), value: '3d' },
    { label: t('emailDetail.expectedReply.quickNextMon'), value: 'next Monday' },
    { label: t('emailDetail.expectedReply.quick2w'), value: '2w' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
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
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setShowSuggestions(false)}
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
        {followUpDuration && (
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={isDisabled}
            aria-label={t('emailDetail.expectedReply.clear')}
            title={t('emailDetail.expectedReply.clear')}
            style={{
              background: 'none',
              border: 'none',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              color: theme.colors.text.tertiary,
              fontSize: '14px',
              padding: '0 2px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>
      {showSuggestions && !isDisabled && (
        <div
          data-testid="follow-up-quick-options"
          style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}
        >
          {quickOptions.map(option => (
            <button
              key={option.value}
              type="button"
              onMouseDown={event => {
                // Prevent input blur so the click registers before suggestions hide
                event.preventDefault();
                onChange(option.value);
                setShowSuggestions(false);
              }}
              style={{
                background: theme.colors.background.subtle,
                border: `1px solid ${theme.colors.border.light}`,
                borderRadius: theme.borderRadius.sm,
                color: theme.colors.text.secondary,
                fontSize: theme.typography.fontSize.xs,
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                cursor: 'pointer',
                textAlign: 'left',
                width: 'fit-content',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
