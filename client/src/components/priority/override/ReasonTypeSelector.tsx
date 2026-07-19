import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { OverrideReasonType } from 'components/priority/types';

interface ReasonTypeSelectorProps {
  selectedReason: OverrideReasonType | '';
  onReasonChange: (reason: OverrideReasonType) => void;
}

export const ReasonTypeSelector: React.FC<ReasonTypeSelectorProps> = ({ selectedReason, onReasonChange }) => {
  const { t } = useTranslation();

  const reasonOptions = [
    { value: OverrideReasonType.WRONG_SENDER_PRIORITY, label: t('priority.override.reason.wrongSenderPriority') },
    { value: OverrideReasonType.WRONG_URGENCY, label: t('priority.override.reason.wrongUrgency') },
    { value: OverrideReasonType.TOPIC_MISMATCH, label: t('priority.override.reason.topicMismatch') },
    { value: OverrideReasonType.OTHER, label: t('priority.override.reason.other') },
  ];

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      {reasonOptions.map(option => (
        <label
          key={option.value}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: theme.spacing.sm,
            marginBottom: theme.spacing.xs,
            cursor: 'pointer',
            borderRadius: theme.borderRadius.sm,
            backgroundColor: selectedReason === option.value ? theme.colors.primary.subtle : 'transparent',
            transition: 'background-color 0.2s',
          }}
        >
          <input
            type="radio"
            name="reasonType"
            value={option.value}
            checked={selectedReason === option.value}
            onChange={event => onReasonChange(event.target.value as OverrideReasonType)}
            style={{
              marginRight: theme.spacing.sm,
              cursor: 'pointer',
            }}
          />
          <span
            style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.primary,
            }}
          >
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
};
