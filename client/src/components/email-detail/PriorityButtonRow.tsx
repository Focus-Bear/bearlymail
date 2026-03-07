import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { LETTER_SPACING_WIDER } from 'constants/strings';

const PRIORITY_OPTIONS = [
  { label: 'Can wait', emoji: '😊', value: 1 },
  { label: 'Get on it', emoji: '😀', value: 2 },
  { label: 'Oh sh$t', emoji: '🤯', value: 3 },
];

interface PriorityButtonRowProps {
  emailId: string;
  starCount: number;
  onSetStarCount: (emailId: string, starCount: number, e?: React.MouseEvent) => void;
}

/**
 * Shared prioritise-button row used by both `EmailDetailActions` (full-page view)
 * and `EmailDetailContent` (inline/panel view).
 *
 * Previously copy-pasted verbatim in two different files — consolidated as part of #698.
 */
export const PriorityButtonRow: React.FC<PriorityButtonRowProps> = ({
  emailId,
  starCount,
  onSetStarCount,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingTop: theme.spacing.sm,
        borderTop: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <span
        style={{
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.tertiary,
          fontWeight: theme.typography.fontWeight.semibold,
          letterSpacing: LETTER_SPACING_WIDER,
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        {t('inbox.prioritise')}
      </span>
      <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
        {PRIORITY_OPTIONS.map(({ label, emoji, value }) => {
          const isActive = starCount === value;
          const newCount = isActive ? 0 : value;
          return (
            <button
              key={value}
              onClick={(event) => {
                event.stopPropagation();
                onSetStarCount(emailId, newCount, event);
              }}
              style={{
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                backgroundColor: isActive ? theme.colors.text.primary : 'transparent',
                color: isActive ? 'white' : theme.colors.text.secondary,
                border: `1px solid ${isActive ? theme.colors.text.primary : theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.full || '999px',
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{emoji}</span>
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
