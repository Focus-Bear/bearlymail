import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EmailDecryptForm } from './EmailDecryptForm';
import { EmailDecryptResultsTable } from './EmailDecryptResultsTable';
import { useAdminEmailDecrypt } from './useAdminEmailDecrypt';

export const EmailDecryptSection: React.FC = () => {
  const { t } = useTranslation();
  const { emailId, setEmailId, encryptionKey, setEncryptionKey, loading, error, result, handleSubmit } =
    useAdminEmailDecrypt();

  return (
    <div>
      <h2
        style={{
          margin: 0,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
        }}
      >
        {t('admin.emailDecrypt.title')}
      </h2>
      <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg, maxWidth: 640 }}>
        {t('admin.emailDecrypt.description')}
      </p>

      <EmailDecryptForm
        emailId={emailId}
        encryptionKey={encryptionKey}
        loading={loading}
        onEmailIdChange={setEmailId}
        onEncryptionKeyChange={setEncryptionKey}
        onSubmit={handleSubmit}
      />

      {error && (
        <div
          role="alert"
          style={{
            padding: theme.spacing.md,
            marginBottom: theme.spacing.lg,
            backgroundColor: theme.colors.error.light,
            color: theme.colors.error.main,
            borderRadius: 4,
          }}
        >
          {error}
        </div>
      )}

      {result && <EmailDecryptResultsTable serverKeyPrefix={result.serverKeyPrefix} fields={result.fields} />}
    </div>
  );
};
