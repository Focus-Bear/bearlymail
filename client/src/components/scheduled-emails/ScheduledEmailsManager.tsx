import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { ACTION_TYPE_REPLY, STRING_NONE } from 'constants/strings';
import { ScheduledEmail, useScheduledEmails } from 'hooks/useScheduledEmails';

const formatRecipients = (email: ScheduledEmail): string =>
  email.to.map(recipient => recipient.name || recipient.email).join(', ');

const formatScheduledTime = (timeStr: string): string => {
  const date = new Date(timeStr);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

interface ScheduledEmailCardProps {
  email: ScheduledEmail;
  onCancel: (id: string) => void;
}

const ScheduledEmailCard: React.FC<ScheduledEmailCardProps> = ({ email, onCancel }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: '8px',
        padding: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '8px',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 'bold', color: theme.colors.text.primary, marginBottom: '4px' }}>
            {email.subject}
          </div>
          <div style={{ fontSize: '14px', color: theme.colors.text.secondary, marginBottom: '4px' }}>
            {t('scheduledEmails.to')}: {formatRecipients(email)}
          </div>
          <div style={{ fontSize: '13px', color: theme.colors.primary.main, fontWeight: 'bold' }}>
            📅 {formatScheduledTime(email.scheduledSendAt)}
          </div>
        </div>
        <button
          onClick={() => onCancel(email.id)}
          style={{
            padding: '6px 12px',
            backgroundColor: theme.colors.error.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          {t('common.cancel')}
        </button>
      </div>
      <div
        style={{
          fontSize: '12px',
          color: theme.colors.text.secondary,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span
          style={{
            backgroundColor:
              email.emailType === ACTION_TYPE_REPLY
                ? `${theme.colors.primary.main}20`
                : `${theme.colors.secondary.main}20`,
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            textTransform: 'uppercase',
          }}
        >
          {email.emailType === ACTION_TYPE_REPLY ? t('scheduledEmails.typeReply') : t('scheduledEmails.typeNew')}
        </span>
      </div>
    </div>
  );
};

export const ScheduledEmailsManager: React.FC = () => {
  const { t } = useTranslation();
  const { scheduledEmails, loading, cancelScheduledEmail } = useScheduledEmails();

  const handleCancel = async (id: string) => {
    if (window.confirm(t('scheduledEmails.confirmCancel'))) {
      await cancelScheduledEmail(id);
    }
  };

  if (loading) {
    return <div style={{ padding: '20px', color: theme.colors.text.primary }}>{t('common.loading')}...</div>;
  }

  if (scheduledEmails.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: theme.colors.text.secondary }}>
        {t('scheduledEmails.noScheduled')}
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ color: theme.colors.text.primary, marginBottom: '20px' }}>{t('scheduledEmails.title')}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {scheduledEmails.map(email => (
          <ScheduledEmailCard key={email.id} email={email} onCancel={handleCancel} />
        ))}
      </div>
    </div>
  );
};
