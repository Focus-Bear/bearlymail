import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';

interface UrgentEmail {
  subject: string;
  from: string;
  priorityScore: number;
}

interface UrgentEmailListProps {
  emails: UrgentEmail[];
  count: number;
}

const getEmailKey = (email: UrgentEmail, index: number): string => {
  return `urgent-${email.subject}-${email.from}-${index}`;
};

export const UrgentEmailList: React.FC<UrgentEmailListProps> = ({ emails, count }) => {
  const { t } = useTranslation();

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      {emails.slice(0, 3).map((email, index) => (
        <div
          key={getEmailKey(email, index)}
          style={{
            padding: theme.spacing.sm,
            backgroundColor: COLOR_NAMED_WHITE,
            borderRadius: theme.borderRadius.sm,
            marginBottom: theme.spacing.xs,
            border: `1px solid ${theme.colors.border.light}`,
          }}
        >
          <div
            style={{
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
              color: theme.colors.text.primary,
              marginBottom: '2px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {email.subject}
          </div>
          <div
            style={{
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.tertiary,
            }}
          >
            {t('inbox.from')}: {email.from}
          </div>
        </div>
      ))}
      {count > 3 && (
        <p
          style={{
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.tertiary,
            textAlign: 'center',
            margin: `${theme.spacing.sm} 0 0 0`,
          }}
        >
          {t('inbox.moreUrgentEmails', { count: count - 3 })}
        </p>
      )}
    </div>
  );
};
