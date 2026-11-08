import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import {
  DEFAULT_TOKEN_EXPIRY_DAYS,
  DEFAULT_TOKEN_NAME,
  MAX_TOKEN_NAME_LENGTH,
  PAT_SCOPES,
  PatScope,
  TOKEN_EXPIRY_OPTIONS,
} from 'constants/claudeAccess';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';

import { CreatePersonalAccessTokenInput } from './types';

const NEVER_EXPIRES_VALUE = 'never';

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.text.primary,
  marginBottom: theme.spacing.xs,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: theme.spacing.sm,
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.primary,
  backgroundColor: theme.colors.background.paper,
};

interface AccessTokenCreateFormProps {
  isSubmitting: boolean;
  onCreate: (input: CreatePersonalAccessTokenInput) => void;
}

/**
 * Name, permission and expiry for a new token. Sending is opt-in so the
 * default token can only read: an email can't talk a read-only Claude into
 * sending anything.
 */
export const AccessTokenCreateForm: React.FC<AccessTokenCreateFormProps> = ({ isSubmitting, onCreate }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(DEFAULT_TOKEN_NAME);
  const [canSend, setCanSend] = useState(false);
  const [expiry, setExpiry] = useState(String(DEFAULT_TOKEN_EXPIRY_DAYS));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const scopes: PatScope[] = canSend ? [PAT_SCOPES.MAIL_READ, PAT_SCOPES.MAIL_SEND] : [PAT_SCOPES.MAIL_READ];
    onCreate({
      name: name.trim(),
      scopes,
      expiresInDays: expiry === NEVER_EXPIRES_VALUE ? null : Number(expiry),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="access-token-create-form"
      style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.md }}>
        <div style={{ flex: '2 1 200px' }}>
          <label htmlFor="access-token-name" style={labelStyle}>
            {t('settings.claudeAccess.nameLabel')}
          </label>
          <input
            id="access-token-name"
            type="text"
            value={name}
            maxLength={MAX_TOKEN_NAME_LENGTH}
            onChange={(event) => setName(event.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <label htmlFor="access-token-expiry" style={labelStyle}>
            {t('settings.claudeAccess.expiryLabel')}
          </label>
          <select
            id="access-token-expiry"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
            style={inputStyle}
          >
            {TOKEN_EXPIRY_OPTIONS.map((days) => (
              <option key={days ?? NEVER_EXPIRES_VALUE} value={days === null ? NEVER_EXPIRES_VALUE : String(days)}>
                {days === null ? t('settings.claudeAccess.neverExpires') : t('settings.claudeAccess.expiryDays', { count: days })}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing.sm, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={canSend}
          onChange={(event) => setCanSend(event.target.checked)}
          data-testid="access-token-can-send"
          style={{ marginTop: '3px' }}
        />
        <span>
          <span style={{ ...labelStyle, display: 'inline', marginBottom: 0 }}>
            {t('settings.claudeAccess.allowSendLabel')}
          </span>
          <span style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
            {t('settings.claudeAccess.allowSendHint')}
          </span>
        </span>
      </label>
      <div>
        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: theme.colors.primary.main,
            color: theme.colors.text.inverse,
            border: 'none',
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.semibold,
            cursor: isSubmitting ? 'wait' : 'pointer',
            opacity: isSubmitting || !name.trim() ? OPACITY_DISABLED : OPACITY_FULL,
          }}
        >
          {isSubmitting ? t('settings.claudeAccess.creating') : t('settings.claudeAccess.createButton')}
        </button>
      </div>
    </form>
  );
};
