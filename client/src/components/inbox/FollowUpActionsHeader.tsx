import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';

interface FollowUpActionsHeaderProps {
  onGenerateDrafts: () => void;
  isGenerating: boolean;
}

export const FollowUpActionsHeader: React.FC<FollowUpActionsHeaderProps> = ({ onGenerateDrafts, isGenerating }) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <h3
          style={{
            margin: 0,
            marginBottom: theme.spacing.xs,
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
          }}
        >
          {t('inbox.generateFollowUps')}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}
        >
          {t('inbox.generateFollowUpsDescription')}
        </p>
      </div>
      <button
        onClick={onGenerateDrafts}
        disabled={isGenerating}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: isGenerating ? theme.colors.background.disabled : theme.colors.primary.main,
          color: theme.colors.background.paper,
          border: 'none',
          borderRadius: theme.borderRadius.md,
          cursor: isGenerating ? 'wait' : 'pointer',
          fontSize: theme.typography.fontSize.base,
          fontWeight: theme.typography.fontWeight.medium,
          transition: theme.transitions.default,
          opacity: isGenerating ? OPACITY_DISABLED : OPACITY_FULL,
        }}
        onMouseEnter={event => {
          if (!isGenerating) {
            event.currentTarget.style.backgroundColor = theme.colors.primary.dark;
          }
        }}
        onMouseLeave={event => {
          if (!isGenerating) {
            event.currentTarget.style.backgroundColor = theme.colors.primary.main;
          }
        }}
      >
        {isGenerating ? t('inbox.generating') : t('inbox.generateFollowUps')}
      </button>
    </div>
  );
};
