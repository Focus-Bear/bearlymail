import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_TRANSPARENT } from 'constants/colors';

interface FollowUpActionsErrorProps {
  error: string;
  onRetry?: () => void;
}

export const FollowUpActionsError: React.FC<FollowUpActionsErrorProps> = ({ error, onRetry }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        marginTop: theme.spacing.md,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.error.light,
        borderRadius: theme.borderRadius.md,
        color: theme.colors.error.main,
        fontSize: theme.typography.fontSize.sm,
      }}
    >
      {error}
      {onRetry && (
        <button
          onClick={() => {
            captureEvent(ANALYTICS_EVENTS.BULK_FOLLOWUPS_GENERATE_RETRY_CLICKED);
            onRetry();
          }}
          style={{
            marginLeft: theme.spacing.md,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.error.main,
            border: `1px solid ${theme.colors.error.main}`,
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('common.retry')}
        </button>
      )}
    </div>
  );
};
