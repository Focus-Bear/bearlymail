import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import {
  ACCESS_LEVELS,
  AccessLevel,
  DEFAULT_TOKEN_EXPIRY_DAYS,
  DEFAULT_TOKEN_NAME,
  MAX_TOKEN_NAME_LENGTH,
  SCOPES_FOR_ACCESS_LEVEL,
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

interface PermissionCheckboxProps {
  isChecked: boolean;
  isDisabled?: boolean;
  label: string;
  hint: string;
  testId: string;
  onChange: (isChecked: boolean) => void;
}

const PermissionCheckbox: React.FC<PermissionCheckboxProps> = ({
  isChecked,
  isDisabled,
  label,
  hint,
  testId,
  onChange,
}) => (
  <label
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: theme.spacing.sm,
      cursor: isDisabled ? 'default' : 'pointer',
    }}
  >
    <input
      type="checkbox"
      checked={isChecked}
      disabled={isDisabled}
      onChange={(event) => onChange(event.target.checked)}
      data-testid={testId}
      style={{ marginTop: '3px' }}
    />
    <span>
      <span style={{ ...labelStyle, display: 'inline', marginBottom: 0 }}>{label}</span>
      <span style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
        {hint}
      </span>
    </span>
  </label>
);

function accessLevelFor(canDraft: boolean, canSend: boolean): AccessLevel {
  if (canSend) {
    return ACCESS_LEVELS.SEND;
  }
  return canDraft ? ACCESS_LEVELS.DRAFT : ACCESS_LEVELS.READ;
}

/**
 * Name, permission and expiry for a new token. Drafting and sending are
 * opt-in so the default token can only read: an email can't talk a read-only
 * Claude into writing or sending anything. Sending includes drafting.
 */
export const AccessTokenCreateForm: React.FC<AccessTokenCreateFormProps> = ({ isSubmitting, onCreate }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(DEFAULT_TOKEN_NAME);
  const [canDraft, setCanDraft] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const [expiry, setExpiry] = useState(String(DEFAULT_TOKEN_EXPIRY_DAYS));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onCreate({
      name: name.trim(),
      scopes: SCOPES_FOR_ACCESS_LEVEL[accessLevelFor(canDraft, canSend)],
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
      <PermissionCheckbox
        isChecked={canDraft || canSend}
        isDisabled={canSend}
        label={t('settings.claudeAccess.allowDraftsLabel')}
        hint={t('settings.claudeAccess.allowDraftsHint')}
        testId="access-token-can-draft"
        onChange={setCanDraft}
      />
      <PermissionCheckbox
        isChecked={canSend}
        label={t('settings.claudeAccess.allowSendLabel')}
        hint={t('settings.claudeAccess.allowSendHint')}
        testId="access-token-can-send"
        onChange={setCanSend}
      />
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
