import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { EMOJI_CHECK, EMOJI_NOTE, EMOJI_OCTOPUS, EMOJI_SELECTED } from 'constants/emojis';
import { GITHUB_STATE_OPEN, GITHUB_STATE_CLOSED, LINK_TYPE_PR } from 'constants/strings';

interface MetadataIndicatorsProps {
  email: Email;
}

const getLinkColor = (link: any): string => {
  if (link.status?.state === GITHUB_STATE_OPEN) return theme.colors.success.main;
  if (link.status?.state === GITHUB_STATE_CLOSED) return theme.colors.text.tertiary;
  if (link.status?.merged) return theme.colors.primary.main;
  return theme.colors.text.secondary;
};

const getLinkBorderColor = (link: any): string => {
  if (link.status?.state === GITHUB_STATE_OPEN) return theme.colors.success.main;
  if (link.status?.state === GITHUB_STATE_CLOSED) return theme.colors.border.medium;
  if (link.status?.merged) return theme.colors.primary.main;
  return theme.colors.border.light;
};

const getStatusIndicator = (link: any): string => {
  if (link.status?.state === GITHUB_STATE_OPEN) return EMOJI_SELECTED;
  if (link.status?.merged) return EMOJI_CHECK;
  return '○';
};

export const MetadataIndicators: React.FC<MetadataIndicatorsProps> = ({ email }) => {
  const { t } = useTranslation();
  const hasIndicators = (email.actionItemsCount !== undefined && email.actionItemsCount > 0) 
    || email.hasPrivateNote 
    || (email.githubMetadata?.links && email.githubMetadata.links.length > 0);

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
      {email.githubMetadata?.links && email.githubMetadata.links.length > 0 && (
        <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
          {email.githubMetadata.links.slice(0, 2).map((link) => (
            <a
              key={link.url || `${link.owner}-${link.repo}-${link.number}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: theme.typography.fontSize.xs,
                color: getLinkColor(link),
                backgroundColor: theme.colors.background.subtle,
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                borderRadius: theme.borderRadius.sm,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.xs,
                border: `1px solid ${getLinkBorderColor(link)}`,
              }}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <span>{EMOJI_OCTOPUS}</span>
              {link.type === LINK_TYPE_PR ? t('github.pr') : t('github.issue')} #{link.number}
              {link.status?.state && (
                <span style={{
                  fontSize: '0.7rem',
                  opacity: 0.8,
                }}>
                  {getStatusIndicator(link)}
                </span>
              )}
            </a>
          ))}
          {email.githubMetadata.links.length > 2 && (
            <span style={{
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.secondary,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            }}>
              {t('inbox.moreLinks', { count: email.githubMetadata.links.length - 2 })}
            </span>
          )}
        </div>
      )}
    </div>
  );
};



