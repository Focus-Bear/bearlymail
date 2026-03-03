import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { EMOJI_CHECK, EMOJI_NOTE } from 'constants/emojis';

const EMOJI_ROBOT = '🤖';

interface MetadataIndicatorsProps {
  email: Email;
}

export const MetadataIndicators: React.FC<MetadataIndicatorsProps> = ({ email }) => {
  const { t } = useTranslation();
  const hasAutoResponseMetadata =
    email.autoResponseCount !== undefined &&
    email.autoResponseCount > 0;

  const hasIndicators =
    (email.actionItemsCount !== undefined && email.actionItemsCount > 0) ||
    email.hasPrivateNote ||
    hasAutoResponseMetadata;

  if (!hasIndicators) {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      gap: theme.spacing.sm,
      flexWrap: 'wrap',
      marginTop: theme.spacing.xs,
      marginBottom: theme.spacing.sm,
      alignItems: 'center',
    }}>
      {hasAutoResponseMetadata && (
        <span style={{
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.accent.info,
          backgroundColor: theme.colors.primary.subtle,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.sm,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          {EMOJI_ROBOT}{' '}
          {t('inbox.autoResponseBadge', {
            count: email.autoResponseCount,
            sentAt: email.autoRespondedAt
              ? new Date(email.autoRespondedAt).toLocaleString()
              : t('inbox.unknownDate'),
          })}
        </span>
      )}
      {email.actionItemsCount !== undefined && email.actionItemsCount > 0 && (
        <span style={{
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.primary.main,
          backgroundColor: theme.colors.primary.subtle,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.sm,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          {EMOJI_CHECK} {t('inbox.actionItems', { count: email.actionItemsCount })}
        </span>
      )}
      {email.hasPrivateNote && (
        <span style={{
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
          backgroundColor: theme.colors.background.subtle,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.sm,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          {EMOJI_NOTE} {t('inbox.note')}
        </span>
      )}
    </div>
  );
};



