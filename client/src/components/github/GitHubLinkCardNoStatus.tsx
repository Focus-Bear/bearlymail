import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { GitHubLink } from 'types/email';

import { EMOJI_ISSUE, EMOJI_PR } from 'constants/emojis';
import { LINK_TYPE_ISSUE } from 'constants/strings';

interface GitHubLinkCardNoStatusProps {
  link: GitHubLink;
}

export const GitHubLinkCardNoStatus: React.FC<GitHubLinkCardNoStatusProps> = ({ link }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: theme.colors.primary.main,
          textDecoration: 'none',
          fontWeight: theme.typography.fontWeight.semibold,
          fontSize: theme.typography.fontSize.base,
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
          display: 'block',
        }}
      >
        {link.type === LINK_TYPE_ISSUE ? EMOJI_ISSUE : EMOJI_PR} {link.owner}/{link.repo}#{link.number}
      </a>
      <p
        style={{
          margin: `${theme.spacing.xs} 0 0`,
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.tertiary,
        }}
      >
        {t('github.statusUnavailable')}
      </p>
    </div>
  );
};
