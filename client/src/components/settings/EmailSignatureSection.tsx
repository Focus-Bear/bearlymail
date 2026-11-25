import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { SaveStatus } from 'components/settings/SaveStatus';
import { useAutosave } from 'hooks/useAutosave';

interface EmailSignatureSectionProps {
  emailSignature: string | null;
  onSignatureChange: (signature: string) => void;
  /** Stores the signature; rejects when it could not be saved. */
  onSave: (signature: string) => Promise<void>;
}

/** The signature added to sent emails. Saves itself a moment after the user stops typing (#482). */
export const EmailSignatureSection: React.FC<EmailSignatureSectionProps> = ({
  emailSignature,
  onSignatureChange,
  onSave,
}) => {
  const { t } = useTranslation();
  const autosave = useAutosave<string>(onSave);

  return (
    <div id="email-signature" style={{ marginBottom: theme.spacing.xl }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        <h2
          style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: '600',
            marginBottom: theme.spacing.md,
            color: theme.colors.text.primary,
          }}
        >
          {t('settings.emailSignature.title')}
        </h2>
        <SaveStatus status={autosave.status} onRetry={autosave.retry} />
      </div>

      <p
        style={{
          marginBottom: theme.spacing.md,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.md,
        }}
      >
        {t('settings.emailSignature.description')}
      </p>

      <label
        htmlFor="email-signature-input"
        style={{
          display: 'block',
          marginBottom: theme.spacing.sm,
          fontSize: theme.typography.fontSize.md,
          fontWeight: '500',
          color: theme.colors.text.primary,
        }}
      >
        {t('settings.emailSignature.label')}
      </label>
      <textarea
        id="email-signature-input"
        value={emailSignature || ''}
        onChange={event => {
          onSignatureChange(event.target.value);
          autosave.saveSoon(event.target.value);
        }}
        placeholder={t('settings.emailSignature.placeholder')}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          minHeight: '80px',
          padding: theme.spacing.md,
          fontSize: theme.typography.fontSize.md,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
      />
    </div>
  );
};
