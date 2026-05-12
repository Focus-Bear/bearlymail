import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { EMOJI_LINK } from 'constants/emojis';

interface GitHubConnectForCIPromptProps {
  /**
   * Whether the user already has the `repo` OAuth scope. The prompt only
   * renders when this is false — calling it for users who do have the scope
   * is a no-op but a wasted render.
   */
  hasRepoScope: boolean;
}

/**
 * Inline link rendered on a PR card when the user's GitHub OAuth grant
 * doesn't include `repo` scope (which we need for the check-runs API).
 * Clicking starts a fresh OAuth flow with `includeRepo=true`.
 *
 * Why this lives on the PR card rather than in Settings: by the time you're
 * looking at a PR-bearing email you've already noticed CI info is missing,
 * and we want re-auth to be one click away from that context.
 */
export const GitHubConnectForCIPrompt: React.FC<GitHubConnectForCIPromptProps> = ({
  hasRepoScope,
}) => {
  const { t } = useTranslation();
  const [isConnecting, setIsConnecting] = useState(false);

  if (hasRepoScope) {
    return null;
  }

  const handleClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (isConnecting) {
      return;
    }
    setIsConnecting(true);
    try {
      const response = await axios.post(`${API_URL}/github/create-connect-token`, {
        includeRepo: true,
      });
      const { token } = response.data;
      window.location.href = `${API_URL}/github/connect?token=${encodeURIComponent(token)}`;
    } catch (error) {
      // Reset so the user can try again — full-page navigation usually means
      // we don't get here unless the create-token call itself failed.
      setIsConnecting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isConnecting}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        color: theme.colors.primary.main,
        fontSize: theme.typography.fontSize.xs,
        fontWeight: theme.typography.fontWeight.medium,
        cursor: isConnecting ? 'not-allowed' : 'pointer',
        textDecoration: 'underline',
        marginRight: theme.spacing.xs,
      }}
    >
      {EMOJI_LINK} {isConnecting ? t('github.ci.connecting') : t('github.ci.connectPrompt')}
    </button>
  );
};
