import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { OPACITY_DISABLED_ALT, OPACITY_FULL } from 'constants/numbers';

interface EmailDecryptFormProps {
  emailId: string;
  encryptionKey: string;
  loading: boolean;
  onEmailIdChange: (value: string) => void;
  onEncryptionKeyChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}

export const EmailDecryptForm: React.FC<EmailDecryptFormProps> = ({
  emailId,
  encryptionKey,
  loading,
  onEmailIdChange,
  onEncryptionKeyChange,
  onSubmit,
}) => {
  const { t } = useTranslation();

  return (
    <form onSubmit={onSubmit} style={{ marginBottom: theme.spacing.xl }}>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label
          htmlFor="admin-decrypt-email-id"
          style={{ display: 'block', marginBottom: theme.spacing.xs, color: theme.colors.text.primary }}
        >
          {t('admin.emailDecrypt.emailIdLabel')}
        </label>
        <input
          id="admin-decrypt-email-id"
          type="text"
          value={emailId}
          onChange={event => onEmailIdChange(event.target.value)}
          autoComplete="off"
          style={{
            width: '100%',
            maxWidth: 480,
            padding: theme.spacing.sm,
            borderRadius: 4,
            border: `1px solid ${theme.colors.border.light}`,
          }}
        />
      </div>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label
          htmlFor="admin-decrypt-encryption-key"
          style={{ display: 'block', marginBottom: theme.spacing.xs, color: theme.colors.text.primary }}
        >
          {t('admin.emailDecrypt.optionalKeyLabel')}
        </label>
        <input
          id="admin-decrypt-encryption-key"
          type="password"
          value={encryptionKey}
          onChange={event => onEncryptionKeyChange(event.target.value)}
          autoComplete="off"
          placeholder={t('admin.emailDecrypt.optionalKeyPlaceholder')}
          style={{
            width: '100%',
            maxWidth: 480,
            padding: theme.spacing.sm,
            borderRadius: 4,
            border: `1px solid ${theme.colors.border.light}`,
          }}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: theme.colors.primary.main,
          color: theme.colors.text.inverse,
          border: 'none',
          borderRadius: 4,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? OPACITY_DISABLED_ALT : OPACITY_FULL,
        }}
      >
        {loading ? t('admin.emailDecrypt.loading') : t('admin.emailDecrypt.submit')}
      </button>
    </form>
  );
};
