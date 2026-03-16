import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

const DISABLED_OPACITY = 0.6;
const ENABLED_OPACITY = 1;

interface EmailSignatureSectionProps {
  emailSignature: string | null;
  onSignatureChange: (signature: string) => void;
  onSave: () => void;
  saving: boolean;
}

export const EmailSignatureSection: React.FC<EmailSignatureSectionProps> = ({
  emailSignature,
  onSignatureChange,
  onSave,
  saving,
}) => {
  const { t } = useTranslation();

  return (
    <div id="email-signature" style={{ marginBottom: theme.spacing.xl }}>
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

      <p
        style={{
          marginBottom: theme.spacing.md,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.md,
        }}
      >
        {t('settings.emailSignature.description')}
      </p>

      <div style={{ marginBottom: theme.spacing.md }}>
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
          onChange={event => onSignatureChange(event.target.value)}
          placeholder={t('settings.emailSignature.placeholder')}
          style={{
            width: '100%',
            minHeight: '80px',
            padding: theme.spacing.md,
            fontSize: theme.typography.fontSize.md,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.borderRadius.md,
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          fontSize: theme.typography.fontSize.md,
          fontWeight: '500',
          color: theme.colors.common.white,
          backgroundColor: theme.colors.primary.main,
          border: 'none',
          borderRadius: theme.borderRadius.md,
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? DISABLED_OPACITY : ENABLED_OPACITY,
        }}
      >
        {saving ? t('settings.emailSignature.saving') : t('settings.emailSignature.save')}
      </button>
    </div>
  );
};
