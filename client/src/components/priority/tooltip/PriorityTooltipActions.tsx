import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { EMOJI_COMMENT } from 'constants/emojis';

interface PriorityTooltipActionsProps {
  onProvideFeedback?: () => void;
}

export const PriorityTooltipActions: React.FC<PriorityTooltipActionsProps> = ({
  onProvideFeedback,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <>
      {/* Feedback button */}
      <div style={{
        marginTop: theme.spacing.xs || '4px',
        paddingTop: theme.spacing.xs || '4px',
        borderTop: `1px solid ${theme.colors.border.light}`,
      }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onProvideFeedback) {
              onProvideFeedback();
            }
          }}
          style={{
            width: '100%',
            padding: `${theme.spacing.xs || '4px'} ${theme.spacing.sm}`,
            backgroundColor: theme.colors.background.subtle,
            border: `1px solid ${theme.colors.border.light}`,
            borderRadius: theme.borderRadius.sm,
            color: theme.colors.text.primary,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.xs,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {/* eslint-disable-next-line i18next/no-literal-string */}
          {EMOJI_COMMENT} {t('priority.tooltip.correctPrioritization')}
        </button>
      </div>
      
      {/* Links to settings and help */}
      <div style={{
        marginTop: theme.spacing.xs || '4px',
        paddingTop: theme.spacing.xs || '4px',
        borderTop: `1px solid ${theme.colors.border.light}`,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.xs || '4px',
      }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate('/settings');
          }}
          style={{
            background: 'none',
            border: 'none',
            color: theme.colors.primary.main,
            cursor: 'pointer',
            fontSize: '0.65rem',
            textDecoration: 'underline',
          }}
        >
          {t('priority.tooltip.adjustContext')} →
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate('/help/context');
          }}
          style={{
            background: 'none',
            border: 'none',
            color: theme.colors.primary.main,
            cursor: 'pointer',
            fontSize: '0.65rem',
            textDecoration: 'underline',
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {t('priority.tooltip.learnMore')} →
        </button>
      </div>
    </>
  );
};



