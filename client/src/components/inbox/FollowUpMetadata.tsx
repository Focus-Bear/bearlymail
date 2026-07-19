import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';

import { MS_PER_DAY } from 'constants/numbers';

interface FollowUpMetadataProps {
  email: Email;
}

export const FollowUpMetadata: React.FC<FollowUpMetadataProps> = ({ email }) => {
  const { t } = useTranslation();

  if (!email.lastTheirReplyAt && !email.lastMyReplyAt) {
    return null;
  }

  const daysSinceTheirReply = email.lastTheirReplyAt
    ? Math.floor((new Date().getTime() - new Date(email.lastTheirReplyAt).getTime()) / MS_PER_DAY)
    : null;

  return (
    <div
      style={{
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        marginBottom: theme.spacing.sm,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.secondary,
      }}
    >
      {email.otherPersonName && (
        <div style={{ marginBottom: theme.spacing.xs }}>
          <strong>{t('inbox.followUpDetails.with')}:</strong> {email.otherPersonName}
        </div>
      )}
      {daysSinceTheirReply !== null ? (
        <div style={{ marginBottom: theme.spacing.xs }}>
          <strong>{t('inbox.followUpDetails.daysSinceResponse')}:</strong> {daysSinceTheirReply}{' '}
          {t('inbox.followUpDetails.day', { count: daysSinceTheirReply })}
        </div>
      ) : (
        <div style={{ marginBottom: theme.spacing.xs }}>
          <strong>{t('inbox.followUpDetails.status')}:</strong> {t('inbox.followUpDetails.noReplyReceived')}
        </div>
      )}
      {email.lastMyReplyAt && (
        <div>
          <strong>{t('inbox.followUpDetails.youSentLast')}:</strong>{' '}
          {new Date(email.lastMyReplyAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
};
