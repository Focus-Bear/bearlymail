import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { EMOJI_LINK, EMOJI_OCTOPUS } from 'constants/emojis';

const CONNECTING_OPACITY = 0.8;

export const GitHubConnectionPrompt: React.FC = () => {
  const { t } = useTranslation();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectClick = async () => {
    setIsConnecting(true);
    try {
      const response = await axios.post(`${API_URL}/github/create-connect-token`);
      const { token } = response.data;
      window.location.href = `${API_URL}/github/connect?token=${encodeURIComponent(token)}`;
    } catch (error) {
      console.error('Error connecting GitHub:', error);
      alert(t('settings.githubConnectError'));
      setIsConnecting(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.xl,
        padding: theme.spacing.lg,
        boxShadow: theme.shadows.sm,
        border: `2px dashed ${theme.colors.border.light}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.md,
        }}
      >
        <div style={{ fontSize: '24px' }}>{EMOJI_OCTOPUS}</div>
        <h3
          style={{
            color: theme.colors.text.primary,
            margin: 0,
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
          }}
        >
          {t('github.connectionPrompt.title')}
        </h3>
      </div>

      <p
        style={{
          color: theme.colors.text.secondary,
          margin: 0,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.sm,
          lineHeight: 1.6,
        }}
      >
        {t('github.connectionPrompt.description')}
      </p>

      <button
        onClick={handleConnectClick}
        disabled={isConnecting}
        style={{
          backgroundColor: isConnecting ? theme.colors.primary.dark : theme.colors.primary.main,
          color: theme.colors.common.white,
          border: 'none',
          borderRadius: theme.borderRadius.md,
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          cursor: isConnecting ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          transition: 'background-color 0.2s ease',
          opacity: isConnecting ? CONNECTING_OPACITY : 1,
        }}
        onMouseEnter={event => {
          if (!isConnecting) {
            event.currentTarget.style.backgroundColor = theme.colors.primary.dark;
          }
        }}
        onMouseLeave={event => {
          if (!isConnecting) {
            event.currentTarget.style.backgroundColor = theme.colors.primary.main;
          }
        }}
      >
        {EMOJI_LINK}{' '}
        {isConnecting ? t('github.connectionPrompt.connecting') : t('github.connectionPrompt.connectButton')}
      </button>
    </div>
  );
};
