import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import type { GitHubLinkAuthor } from 'types/email';

import { EMOJI_ROBOT } from 'constants/emojis';

import { getBotLabel } from './githubBot';

interface GitHubBotBadgeProps {
  author?: GitHubLinkAuthor;
}

export const GitHubBotBadge: React.FC<GitHubBotBadgeProps> = ({ author }) => {
  const { t } = useTranslation();
  const botName = getBotLabel(author);
  if (!botName) {
    return null;
  }

  return (
    <div
      aria-label={t('github.bot.ariaLabel', { name: botName })}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        backgroundColor: theme.colors.background.paper,
        color: theme.colors.text.secondary,
        borderRadius: theme.borderRadius.sm,
        fontSize: theme.typography.fontSize.xs,
        fontWeight: theme.typography.fontWeight.medium,
        marginRight: theme.spacing.xs,
      }}
    >
      {EMOJI_ROBOT} {botName}
    </div>
  );
};
