import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_CHECK, EMOJI_CLIPBOARD, EMOJI_SIREN, EMOJI_WARNING } from 'constants/emojis';
import { URGENCY_HIGH_THRESHOLD, URGENCY_LOW, URGENCY_THRESHOLD } from 'constants/numbers';

interface UrgencyScoreInputProps {
  urgencyScore: number;
  onScoreChange: (score: number) => void;
}

export const UrgencyScoreInput: React.FC<UrgencyScoreInputProps> = ({ urgencyScore, onScoreChange }) => {
  const { t } = useTranslation();

  const getUrgencyLabel = (score: number): string => {
    if (score >= URGENCY_THRESHOLD) {
      return `${EMOJI_SIREN} ${t('priority.override.urgency.critical')}`;
    }
    if (score >= URGENCY_HIGH_THRESHOLD) {
      return `${EMOJI_WARNING} ${t('priority.override.urgency.high')}`;
    }
    if (score >= URGENCY_LOW) {
      return `${EMOJI_CLIPBOARD} ${t('priority.override.urgency.moderate')}`;
    }
    return `${EMOJI_CHECK} ${t('priority.override.urgency.low')}`;
  };

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      <label
        style={{
          display: 'block',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('priority.override.newScoreLabel')}:
      </label>
      <input
        type="number"
        min="0"
        max="100"
        value={urgencyScore}
        onChange={event => onScoreChange(Math.max(0, Math.min(100, parseInt(event.target.value) || 0)))}
        style={{
          width: '100%',
          padding: theme.spacing.sm,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.sm,
          fontFamily: theme.typography.fontFamily,
        }}
      />
      <div
        style={{
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
          marginTop: theme.spacing.xs,
        }}
      >
        {getUrgencyLabel(urgencyScore)}
      </div>
    </div>
  );
};
