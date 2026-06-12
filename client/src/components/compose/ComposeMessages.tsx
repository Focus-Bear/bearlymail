import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { formatScheduledTime } from 'utils/dateUtils';

interface ComposeMessagesProps {
  error: string | null;
  sendSuccess: boolean;
  /** When set, the success message describes a scheduled send instead of an immediate one. */
  scheduledFor?: Date | null;
}

export const ComposeMessages: React.FC<ComposeMessagesProps> = ({ error, sendSuccess, scheduledFor }) => {
  const { t } = useTranslation();

  if (!error && !sendSuccess) {
    return null;
  }

  return (
    <>
      {error && (
        <div
          style={{
            marginTop: theme.spacing.md,
            padding: theme.spacing.md,
            backgroundColor: theme.colors.sunray.light4,
            borderRadius: theme.borderRadius.md,
            color: theme.colors.accent.error,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {error}
        </div>
      )}
      {sendSuccess && (
        <div
          style={{
            marginTop: theme.spacing.md,
            padding: theme.spacing.md,
            backgroundColor: theme.colors.secondary.subtle,
            borderRadius: theme.borderRadius.md,
            color: theme.colors.secondary.dark,
            fontSize: theme.typography.fontSize.sm,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {scheduledFor
            ? t('compose.emailScheduledSuccess', { time: formatScheduledTime(scheduledFor) })
            : t('compose.emailSentSuccess')}
        </div>
      )}
    </>
  );
};
