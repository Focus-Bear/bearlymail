import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../../../theme/theme';

interface UrgentEmail {
  subject: string;
  from: string;
  priorityScore: number;
}

interface UrgentNotificationProps {
  count: number;
  emails: UrgentEmail[];
  onDismiss: () => void;
}

/**
 * Urgent emails notification component
 */
export const UrgentNotification: React.FC<UrgentNotificationProps> = ({
  count,
  emails,
  onDismiss,
}) => {
  const { t } = useTranslation();

  const hasUrgentEmails = count > 0;

  const getTopPosition = (): string | undefined => {
    if (hasUrgentEmails) return theme.spacing.lg;
    return undefined;
  };

  const getBottomPosition = (): string | undefined => {
    if (!hasUrgentEmails) return theme.spacing.lg;
    return undefined;
  };

  const getBackgroundColor = (): string => {
    if (hasUrgentEmails) return theme.colors.sunray.light4;
    return theme.colors.background.paper;
  };

  const getBorderColor = (): string => {
    if (hasUrgentEmails) return theme.colors.accent.error;
    return theme.colors.border.light;
  };

  const getEmailKey = (email: UrgentEmail, index: number): string => {
    return `urgent-${email.subject}-${email.from}-${index}`;
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: getTopPosition(),
        bottom: getBottomPosition(),
        right: theme.spacing.lg,
        backgroundColor: getBackgroundColor(),
        padding: theme.spacing.lg,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.xl,
        minWidth: '320px',
        maxWidth: '400px',
        zIndex: 2000,
        border: `2px solid ${getBorderColor()}`,
      }}
    >
      {hasUrgentEmails ? (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.sm,
              marginBottom: theme.spacing.md,
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>🚨</span>
            <h3
              style={{
                color: theme.colors.accent.error,
                margin: 0,
                fontSize: theme.typography.fontSize.lg,
                fontWeight: theme.typography.fontWeight.bold,
              }}
            >
              {count} Urgent Email{count > 1 ? 's' : ''} Found!
            </h3>
          </div>
          <p
            style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.md,
            }}
          >
            You have urgent emails waiting. They'll be delivered at the next batch time.
          </p>
          <div style={{ marginBottom: theme.spacing.md }}>
            {emails.slice(0, 3).map((email, index) => (
              <div
                key={getEmailKey(email, index)}
                style={{
                  padding: theme.spacing.sm,
                  backgroundColor: 'white',
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
                  From: {email.from}
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
                +{count - 3} more urgent email{count - 3 > 1 ? 's' : ''}
              </p>
            )}
          </div>
          <button
            onClick={onDismiss}
            style={{
              marginTop: theme.spacing.md,
              width: '100%',
              padding: theme.spacing.sm,
              backgroundColor: theme.colors.accent.error,
              color: 'white',
              border: 'none',
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
            }}
          >
            {t('common.dismiss')}
          </button>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
          <span>✓</span>
          <p
            style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
              margin: 0,
            }}
          >
            {t('inbox.noUrgentEmailsFound')}
          </p>
        </div>
      )}
    </div>
  );
};

