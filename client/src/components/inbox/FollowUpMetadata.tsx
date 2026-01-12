import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';

interface FollowUpMetadataProps {
  email: Email & {
    otherPersonName?: string;
    lastTheirReplyAt?: string;
    lastMyReplyAt?: string;
  };
}

export const FollowUpMetadata: React.FC<FollowUpMetadataProps> = ({ email }) => {
  const { t } = useTranslation();
  
  if (!email.lastTheirReplyAt && !email.lastMyReplyAt) {
    return null;
  }

  const daysSinceTheirReply = email.lastTheirReplyAt 
    ? Math.floor((new Date().getTime() - new Date(email.lastTheirReplyAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div style={{
      padding: theme.spacing.sm,
      backgroundColor: theme.colors.background.subtle,
      borderRadius: theme.borderRadius.md,
      marginBottom: theme.spacing.sm,
      fontSize: theme.typography.fontSize.sm,
      color: theme.colors.text.secondary,
    }}>
      {email.otherPersonName && (
        <div style={{ marginBottom: theme.spacing.xs }}>
          <strong>{t('inbox.followUp.with')}:</strong> {email.otherPersonName}
        </div>
      )}
      {daysSinceTheirReply !== null ? (
        <div style={{ marginBottom: theme.spacing.xs }}>
          <strong>{t('inbox.followUp.daysSinceResponse')}:</strong> {daysSinceTheirReply} {t('inbox.followUp.day', { count: daysSinceTheirReply })}
        </div>
      ) : (
        <div style={{ marginBottom: theme.spacing.xs }}>
          <strong>{t('inbox.followUp.status')}:</strong> {t('inbox.followUp.noReplyReceived')}
        </div>
      )}
      {email.lastMyReplyAt && (
        <div>
          <strong>{t('inbox.followUp.youSentLast')}:</strong> {new Date(email.lastMyReplyAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
};


