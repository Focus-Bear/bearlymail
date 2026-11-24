import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { REPLAY_TOUR_PATH } from 'constants/tour';

const cardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: theme.spacing.md,
  padding: theme.spacing.lg,
  marginBottom: theme.spacing.lg,
  backgroundColor: theme.colors.primary.subtle,
  border: `1px solid ${theme.colors.primary.main}`,
  borderRadius: theme.borderRadius.lg,
};

const buttonStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  backgroundColor: theme.colors.primary.main,
  color: theme.colors.text.inverse,
  borderRadius: theme.borderRadius.md,
  fontWeight: theme.typography.fontWeight.semibold,
  textDecoration: 'none',
};

/**
 * Lets people rewatch the onboarding walkthrough from Help, where they go when
 * they've forgotten how something works (it was previously only in Settings).
 */
export const ReplayTourCard: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div style={cardStyle}>
      <div style={{ flex: '1 1 240px' }}>
        <h2
          style={{
            margin: `0 0 ${theme.spacing.xs}`,
            color: theme.colors.text.primary,
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
          }}
        >
          {t('help.replayTour.title')}
        </h2>
        <p style={{ margin: 0, color: theme.colors.text.secondary, lineHeight: theme.typography.lineHeight.relaxed }}>
          {t('help.replayTour.description')}
        </p>
      </div>
      <Link
        to={REPLAY_TOUR_PATH}
        onClick={() => captureEvent(ANALYTICS_EVENTS.HELP_REPLAY_TOUR_CLICKED)}
        style={buttonStyle}
      >
        {t('help.replayTour.button')}
      </Link>
    </div>
  );
};
