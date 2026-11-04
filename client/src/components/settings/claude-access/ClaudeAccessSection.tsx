import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { SETTINGS_ANCHORS } from 'constants/settingsAnchors';
import { useNotifications } from 'contexts/NotificationContext';

import { AccessTokenCreateForm } from './AccessTokenCreateForm';
import { AccessTokenList } from './AccessTokenList';
import { NewTokenPanel } from './NewTokenPanel';
import { CreatePersonalAccessTokenInput, PersonalAccessToken } from './types';
import { usePersonalAccessTokens } from './usePersonalAccessTokens';

const subheadingStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.md,
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.text.primary,
  margin: `${theme.spacing.lg} 0 ${theme.spacing.sm}`,
};

/**
 * Settings → "Connect Claude": create the personal access tokens Claude uses
 * to reach BearlyMail's MCP endpoint, and revoke them.
 */
export const ClaudeAccessSection: React.FC = () => {
  const { t } = useTranslation();
  const { showError, showSuccess } = useNotifications();
  const { tokens, isLoading, hasLoadError, createToken, revokeToken } = usePersonalAccessTokens();
  const [newToken, setNewToken] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleCreate = async (input: CreatePersonalAccessTokenInput) => {
    setIsCreating(true);
    try {
      const created = await createToken(input);
      setNewToken(created.token);
    } catch (err: unknown) {
      console.error('Failed to create access token:', err);
      showError(t('settings.claudeAccess.createError'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (token: PersonalAccessToken) => {
    if (!window.confirm(t('settings.claudeAccess.revokeConfirm', { name: token.name }))) {
return;
}
    setRevokingId(token.id);
    try {
      await revokeToken(token.id);
      showSuccess(t('settings.claudeAccess.revoked', { name: token.name }));
    } catch (err: unknown) {
      console.error('Failed to revoke access token:', err);
      showError(t('settings.claudeAccess.revokeError'));
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div
      id={SETTINGS_ANCHORS.CLAUDE_ACCESS}
      data-testid="claude-access-section"
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.xl,
        marginBottom: theme.spacing.lg,
        boxShadow: theme.shadows.md,
      }}
    >
      <h2
        style={{
          fontSize: theme.typography.fontSize.xl,
          fontWeight: theme.typography.fontWeight.semibold,
          margin: `0 0 ${theme.spacing.sm}`,
          color: theme.colors.text.primary,
        }}
      >
        {t('settings.claudeAccess.title')}
      </h2>
      <p style={{ margin: 0, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
        {t('settings.claudeAccess.description')}
      </p>
      <p
        style={{
          margin: `${theme.spacing.sm} 0 ${theme.spacing.lg}`,
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.tertiary,
        }}
      >
        {t('settings.claudeAccess.safetyNote')}
      </p>

      {newToken && <NewTokenPanel token={newToken} onDismiss={() => setNewToken(null)} />}

      <AccessTokenCreateForm isSubmitting={isCreating} onCreate={handleCreate} />

      <h3 style={subheadingStyle}>{t('settings.claudeAccess.activeTokens')}</h3>
      {isLoading && (
        <p style={{ margin: 0, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
          {t('settings.claudeAccess.loading')}
        </p>
      )}
      {!isLoading && hasLoadError && (
        <p role="alert" style={{ margin: 0, fontSize: theme.typography.fontSize.sm, color: theme.colors.error.dark }}>
          {t('settings.claudeAccess.loadError')}
        </p>
      )}
      {!isLoading && !hasLoadError && (
        <AccessTokenList tokens={tokens} revokingId={revokingId} onRevoke={handleRevoke} />
      )}
    </div>
  );
};
