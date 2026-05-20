import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { MS_PER_DAY } from 'constants/numbers';
import { ThreadWithFollowUp } from 'hooks/useFollowUps';

interface ThreadMetadataProps {
  thread: ThreadWithFollowUp;
}

const calculateDaysSinceLastResponse = (thread: ThreadWithFollowUp): number | null => {
  const lastTheirReplyAt = thread.lastTheirReplyAt;
  if (!lastTheirReplyAt) {
    return null;
  }
  const days = Math.floor((new Date().getTime() - new Date(lastTheirReplyAt).getTime()) / MS_PER_DAY);
  return days;
};

export const ThreadMetadata: React.FC<ThreadMetadataProps> = ({ thread }) => {
  const { t } = useTranslation();
  const daysSinceLastResponse = calculateDaysSinceLastResponse(thread);
  const otherPersonName = thread.otherPersonName || thread.fromName || thread.from;
  const lastMyReplyAt = thread.lastMyReplyAt;
  const followUpDueAt = thread.followUpDueAt;

  return (
    <div style={{ marginBottom: theme.spacing.xs }}>
      <p
        style={{
          margin: 0,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xs,
        }}
      >
        <strong>{t('inbox.followUpDetails.with')}:</strong> {otherPersonName}
      </p>
      {daysSinceLastResponse !== null ? (
        <p
          style={{
            margin: 0,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xs,
          }}
        >
          <strong>{t('inbox.followUpDetails.daysSinceResponse')}:</strong> {daysSinceLastResponse}{' '}
          {t('inbox.followUpDetails.day', { count: daysSinceLastResponse })}
        </p>
      ) : (
        <p
          style={{
            margin: 0,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xs,
          }}
        >
          <strong>{t('inbox.followUpDetails.status')}:</strong> {t('inbox.followUpDetails.noReplyReceived')}
        </p>
      )}
      {lastMyReplyAt && (
        <p
          style={{
            margin: 0,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            marginBottom: followUpDueAt ? theme.spacing.xs : 0,
          }}
        >
          <strong>{t('inbox.followUpDetails.youSentLast')}:</strong> {new Date(lastMyReplyAt).toLocaleDateString()}
        </p>
      )}
      {followUpDueAt && (() => {
        const dueDate = new Date(followUpDueAt);
        const isPremature = dueDate > new Date();
        return (
          <p
            style={{
              margin: 0,
              fontSize: theme.typography.fontSize.sm,
              color: isPremature ? theme.colors.warning.main : theme.colors.text.secondary,
            }}
          >
            <strong>
              {isPremature
                ? t('inbox.followUpDetails.followUpScheduledFor')
                : t('inbox.followUpDetails.followUpWasDue')}
              :
            </strong>{' '}
            {dueDate.toLocaleDateString()}
            {isPremature && (
              <span style={{ marginLeft: 4 }}>
                {t('inbox.followUpDetails.appearsEarly')}
              </span>
            )}
          </p>
        );
      })()}
    </div>
  );
};
