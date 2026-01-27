import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { ThreadWithFollowUp } from 'hooks/useFollowUps';

interface ThreadMetadataProps {
  thread: ThreadWithFollowUp;
}

const calculateDaysSinceLastResponse = (thread: ThreadWithFollowUp): number | null => {
  const lastTheirReplyAt = (thread as any).lastTheirReplyAt;
  if (!lastTheirReplyAt) {
    return null;
  }
  const days = Math.floor(
    (new Date().getTime() - new Date(lastTheirReplyAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  return days;
};

export const ThreadMetadata: React.FC<ThreadMetadataProps> = ({ thread }) => {
  const { t } = useTranslation();
  const daysSinceLastResponse = calculateDaysSinceLastResponse(thread);
  const otherPersonName = (thread as any).otherPersonName || thread.fromName || thread.from;
  const lastMyReplyAt = (thread as any).lastMyReplyAt;

  return (
    <div style={{ marginBottom: theme.spacing.xs }}>
      <p style={{
        margin: 0,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.secondary,
        marginBottom: theme.spacing.xs,
      }}>
        <strong>{t('inbox.followUpDetails.with')}:</strong> {otherPersonName}
      </p>
      {daysSinceLastResponse !== null ? (
        <p style={{
          margin: 0,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xs,
        }}>
          <strong>{t('inbox.followUpDetails.daysSinceResponse')}:</strong> {daysSinceLastResponse} {t('inbox.followUpDetails.day', { count: daysSinceLastResponse })}
        </p>
      ) : (
        <p style={{
          margin: 0,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xs,
        }}>
          <strong>{t('inbox.followUpDetails.status')}:</strong> {t('inbox.followUpDetails.noReplyReceived')}
        </p>
      )}
      {lastMyReplyAt && (
        <p style={{
          margin: 0,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
        }}>
          <strong>{t('inbox.followUpDetails.youSentLast')}:</strong> {new Date(lastMyReplyAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
};



