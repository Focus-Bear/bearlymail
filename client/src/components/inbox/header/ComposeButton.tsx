import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

export const ComposeButton: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <button
      onClick={() => {
        captureEvent(ANALYTICS_EVENTS.COMPOSE_BUTTON_CLICKED);
        navigate('/compose');
      }}
      style={{
        padding: `${theme.spacing.xs} ${theme.spacing.md}`,
        backgroundColor: theme.colors.secondary.main,
        color: COLOR_NAMED_WHITE,
        border: STRING_NONE,
        borderRadius: theme.borderRadius.md,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.xs,
        fontWeight: theme.typography.fontWeight.medium,
        transition: theme.transitions.fast,
      }}
      onMouseEnter={event => (event.currentTarget.style.backgroundColor = theme.colors.secondary.dark)}
      onMouseLeave={event => (event.currentTarget.style.backgroundColor = theme.colors.secondary.main)}
    >
      {t('compose.title')}
    </button>
  );
};
