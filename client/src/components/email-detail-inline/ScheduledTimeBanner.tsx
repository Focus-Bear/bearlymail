import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { formatScheduledTime } from 'utils/dateUtils';

interface ScheduledTimeBannerProps {
  scheduledSendAt: Date;
  onClearSchedule?: () => void;
}

/**
 * Displays the scheduled send time with an optional clear button.
 * Only rendered when a scheduled time is set.
 */
export const ScheduledTimeBanner: React.FC<ScheduledTimeBannerProps> = ({ scheduledSendAt, onClearSchedule }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '8px',
        color: theme.colors.primary.main,
        fontSize: theme.typography.fontSize.sm,
      }}
    >
      <span>🕐</span>
      <span>{t('compose.scheduledFor', { time: formatScheduledTime(scheduledSendAt) })}</span>
      {onClearSchedule && (
        <button
          onClick={onClearSchedule}
          title={t('compose.clearSchedule')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.colors.text.tertiary,
            fontSize: '14px',
            padding: '0 2px',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
};
