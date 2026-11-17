import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { getAxiosErrorMessage } from 'utils/errors';
import { captureEvent } from 'utils/posthog';

import type { AiProviderDescriptor } from 'constants/ownAiAccount';
import type { AiKeyStatus } from 'hooks/settings/useOwnAiKeys';

import {
  dangerButtonStyle,
  keyInputStyle,
  linkStyle,
  primaryButtonStyle,
  providerRowStyle,
  rejectedNoticeStyle,
  secondaryButtonStyle,
} from './ownAiAccountStyles';

interface AiProviderKeyRowProps {
  provider: AiProviderDescriptor;
  status: AiKeyStatus | undefined;
  onSave: (key: string) => Promise<void>;
  onRemove: () => Promise<void>;
}

/** One provider: its saved key (masked) with Replace/Remove, or an entry field. */
export const AiProviderKeyRow: React.FC<AiProviderKeyRowProps> = ({ provider, status, onSave, onRemove }) => {
  const { t } = useTranslation();
  const [draftKey, setDraftKey] = useState('');
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const providerName = t(provider.nameKey);
  const hasKey = Boolean(status?.hasKey);
  const isEditing = !hasKey || isReplacing;
  const canSave = draftKey.trim().length > 0 && !isSaving;

  const saveKey = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await onSave(draftKey.trim());
      captureEvent(provider.savedEvent);
      setDraftKey('');
      setIsReplacing(false);
    } catch (error) {
      setErrorMessage(getAxiosErrorMessage(error, t('settings.ownAiAccount.saveError')));
    } finally {
      setIsSaving(false);
    }
  };

  const removeKey = async () => {
    if (!window.confirm(t('settings.ownAiAccount.confirmRemove', { provider: providerName }))) {
      return;
    }
    setErrorMessage(null);
    try {
      await onRemove();
      captureEvent(provider.removedEvent);
    } catch (error) {
      setErrorMessage(getAxiosErrorMessage(error, t('settings.ownAiAccount.removeError')));
    }
  };

  return (
    <div style={providerRowStyle} data-testid={`ai-provider-${provider.id}`}>
      <strong style={{ color: theme.colors.text.primary }}>{providerName}</strong>
      <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
        {t(provider.descriptionKey)}
      </span>

      {status?.rejectedAt && (
        <div role="alert" style={rejectedNoticeStyle}>
          {t('settings.ownAiAccount.keyRejected', {
            provider: providerName,
            date: new Date(status.rejectedAt).toLocaleString(),
          })}
        </div>
      )}

      {hasKey && !isReplacing && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center' }}>
          <code style={{ fontSize: theme.typography.fontSize.sm }}>{status?.maskedKey}</code>
          <button type="button" style={secondaryButtonStyle} onClick={() => setIsReplacing(true)}>
            {t('settings.ownAiAccount.replaceKey')}
          </button>
          <button type="button" style={dangerButtonStyle} onClick={removeKey}>
            {t('settings.ownAiAccount.removeKey')}
          </button>
        </div>
      )}

      {isEditing && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center' }}>
          <input
            type={isKeyVisible ? 'text' : 'password'}
            value={draftKey}
            onChange={event => setDraftKey(event.target.value)}
            placeholder={provider.keyPlaceholder}
            aria-label={t('settings.ownAiAccount.keyInputLabel', { provider: providerName })}
            autoComplete="off"
            style={keyInputStyle}
          />
          <button type="button" style={secondaryButtonStyle} onClick={() => setIsKeyVisible(!isKeyVisible)}>
            {isKeyVisible ? t('settings.hide') : t('settings.show')}
          </button>
          <button type="button" style={primaryButtonStyle(canSave)} disabled={!canSave} onClick={saveKey}>
            {isSaving ? t('settings.ownAiAccount.checkingKey') : t('settings.ownAiAccount.saveKey')}
          </button>
          {isReplacing && (
            <button type="button" style={secondaryButtonStyle} onClick={() => setIsReplacing(false)}>
              {t('common.cancel')}
            </button>
          )}
          <a href={provider.keyConsoleUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            {t('settings.ownAiAccount.getKey')}
          </a>
        </div>
      )}

      {errorMessage && (
        <div role="alert" style={rejectedNoticeStyle}>
          {errorMessage}
        </div>
      )}
    </div>
  );
};
