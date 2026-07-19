import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface AnalyzeEmailsButtonProps {
  hasRunAnalysis: boolean | null;
}

export const AnalyzeEmailsButton: React.FC<AnalyzeEmailsButtonProps> = ({ hasRunAnalysis }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (hasRunAnalysis !== false) {
    return null;
  }

  return (
    <button
      onClick={() => {
        captureEvent(ANALYTICS_EVENTS.ANALYZE_EMAILS_BUTTON_CLICKED);
        navigate('/settings#context');
      }}
      style={{
        padding: `${theme.spacing.xs} ${theme.spacing.md}`,
        backgroundColor: theme.colors.accent.info,
        color: COLOR_NAMED_WHITE,
        border: STRING_NONE,
        borderRadius: theme.borderRadius.md,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.xs,
        fontWeight: theme.typography.fontWeight.medium,
        transition: theme.transitions.fast,
      }}
      onMouseEnter={event => (event.currentTarget.style.backgroundColor = theme.colors.button.primary.hover)}
      onMouseLeave={event => (event.currentTarget.style.backgroundColor = theme.colors.accent.info)}
    >
      {t('settings.analyzeEmails')}
    </button>
  );
};
