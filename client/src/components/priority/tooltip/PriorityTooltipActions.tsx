import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_COMMENT } from 'constants/emojis';

interface PriorityTooltipActionsProps {
  emailId: string;
  onProvideFeedback?: () => void;
}

export const PriorityTooltipActions: React.FC<PriorityTooltipActionsProps> = ({ emailId, onProvideFeedback }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        marginTop: theme.spacing.xs || '4px',
        paddingTop: theme.spacing.xs || '4px',
        borderTop: `1px solid ${theme.colors.border.light}`,
        textAlign: 'center',
      }}
    >
      <a
        href={`/email/${emailId}`}
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          if (onProvideFeedback) {
            onProvideFeedback();
          }
        }}
        style={{
          color: theme.colors.primary.main,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.xs,
          textDecoration: 'underline',
        }}
      >
        {EMOJI_COMMENT} {t('priority.tooltip.correctPrioritization')}
      </a>
    </div>
  );
};
