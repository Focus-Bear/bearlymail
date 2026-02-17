import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';
import { EMOJI_OCTOPUS, EMOJI_LINK } from 'constants/emojis';

export const GitHubConnectionPrompt: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleConnectClick = () => {
    navigate('/settings?section=integrations');
  };

  return (
    <div style={{
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing.lg,
      boxShadow: theme.shadows.sm,
      border: `2px dashed ${theme.colors.border.light}`,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.md,
      }}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <div style={{ fontSize: '24px' }}>{EMOJI_OCTOPUS}</div>
        <h3 style={{
          color: theme.colors.text.primary,
          margin: 0,
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
        }}>
          {t('github.connectionPrompt.title')}
        </h3>
      </div>

      <p style={{
        color: theme.colors.text.secondary,
        margin: 0,
        marginBottom: theme.spacing.md,
        fontSize: theme.typography.fontSize.sm,
        lineHeight: 1.6,
      }}>
        {t('github.connectionPrompt.description')}
      </p>

      <button
        onClick={handleConnectClick}
        style={{
          backgroundColor: theme.colors.primary.main,
          color: theme.colors.primary.contrast,
          border: 'none',
          borderRadius: theme.borderRadius.md,
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          transition: 'background-color 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = theme.colors.primary.dark;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = theme.colors.primary.main;
        }}
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        {EMOJI_LINK} {t('github.connectionPrompt.connectButton')}
      </button>
    </div>
  );
};
