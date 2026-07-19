import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { UrgentEmailList } from 'components/inbox/overlays/UrgentEmailList';
import { UrgentNotificationHeader } from 'components/inbox/overlays/UrgentNotificationHeader';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { EMOJI_CHECK } from 'constants/emojis';
import { Z_INDEX_POPUP } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

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
export const UrgentNotification: React.FC<UrgentNotificationProps> = ({ count, emails, onDismiss }) => {
  const { t } = useTranslation();

  const hasUrgentEmails = count > 0;

  const getTopPosition = (): string | undefined => {
    if (hasUrgentEmails) {
      return theme.spacing.lg;
    }
    return undefined;
  };

  const getBottomPosition = (): string | undefined => {
    if (!hasUrgentEmails) {
      return theme.spacing.lg;
    }
    return undefined;
  };

  const getBackgroundColor = (): string => {
    if (hasUrgentEmails) {
      return theme.colors.sunray.light4;
    }
    return theme.colors.background.paper;
  };

  const getBorderColor = (): string => {
    if (hasUrgentEmails) {
      return theme.colors.accent.error;
    }
    return theme.colors.border.light;
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
        zIndex: Z_INDEX_POPUP,
        border: `2px solid ${getBorderColor()}`,
      }}
    >
      {hasUrgentEmails ? (
        <>
          <UrgentNotificationHeader count={count} />
          <p
            style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.md,
            }}
          >
            {t('inbox.urgentEmailsWaiting')}
          </p>
          <UrgentEmailList emails={emails} count={count} />
          <button
            onClick={onDismiss}
            style={{
              marginTop: theme.spacing.md,
              width: '100%',
              padding: theme.spacing.sm,
              backgroundColor: theme.colors.accent.error,
              color: COLOR_NAMED_WHITE,
              border: STRING_NONE,
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
          <span>{EMOJI_CHECK}</span>
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
