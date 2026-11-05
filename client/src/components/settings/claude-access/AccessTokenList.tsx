import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { PAT_SCOPES } from 'constants/claudeAccess';

import { PersonalAccessToken } from './types';

interface AccessTokenListProps {
  tokens: PersonalAccessToken[];
  revokingId: string | null;
  onRevoke: (token: PersonalAccessToken) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

/** Active tokens with what each may do, when it was last used, and a revoke button. */
export const AccessTokenList: React.FC<AccessTokenListProps> = ({ tokens, revokingId, onRevoke }) => {
  const { t } = useTranslation();

  if (!tokens.length) {
    return (
      <p style={{ margin: 0, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
        {t('settings.claudeAccess.noTokens')}
      </p>
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="access-token-list">
      {tokens.map((token) => {
        const canSend = token.scopes.includes(PAT_SCOPES.MAIL_SEND);
        return (
          <li
            key={token.id}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.spacing.sm,
              padding: `${theme.spacing.sm} 0`,
              borderTop: `1px solid ${theme.colors.border.light}`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: theme.typography.fontSize.sm,
                  fontWeight: theme.typography.fontWeight.semibold,
                  color: theme.colors.text.primary,
                }}
              >
                {token.name}{' '}
                <code style={{ fontWeight: 'normal', color: theme.colors.text.secondary }}>{token.tokenPrefix}…</code>
              </div>
              <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
                {canSend ? t('settings.claudeAccess.scopeReadSend') : t('settings.claudeAccess.scopeRead')}
                {' · '}
                {token.lastUsedAt
                  ? t('settings.claudeAccess.lastUsed', { date: formatDate(token.lastUsedAt) })
                  : t('settings.claudeAccess.neverUsed')}
                {' · '}
                {token.expiresAt
                  ? t('settings.claudeAccess.expires', { date: formatDate(token.expiresAt) })
                  : t('settings.claudeAccess.neverExpires')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRevoke(token)}
              disabled={revokingId === token.id}
              aria-label={t('settings.claudeAccess.revokeAria', { name: token.name })}
              style={{
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                border: `1px solid ${theme.colors.error.main}`,
                borderRadius: theme.borderRadius.md,
                backgroundColor: theme.colors.background.paper,
                color: theme.colors.error.dark,
                fontSize: theme.typography.fontSize.sm,
                cursor: 'pointer',
              }}
            >
              {revokingId === token.id ? t('settings.claudeAccess.revoking') : t('settings.claudeAccess.revoke')}
            </button>
          </li>
        );
      })}
    </ul>
  );
};
