import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { DecryptFieldRow } from './useAdminEmailDecrypt';

interface EmailDecryptResultsTableProps {
  serverKeyPrefix: string;
  fields: DecryptFieldRow[];
}

export const EmailDecryptResultsTable: React.FC<EmailDecryptResultsTableProps> = ({ serverKeyPrefix, fields }) => {
  const { t } = useTranslation();

  return (
    <div>
      <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
        <strong>{t('admin.emailDecrypt.serverKeyPrefixLabel')}</strong>{' '}
        <code style={{ userSelect: 'all' }}>{serverKeyPrefix || t('admin.emailDecrypt.emptyPrefix')}</code>
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          <thead>
            <tr style={{ borderBottom: `2px solid ${theme.colors.border.light}` }}>
              <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>{t('admin.emailDecrypt.columnField')}</th>
              <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                {t('admin.emailDecrypt.columnCiphertextPreview')}
              </th>
              <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                {t('admin.emailDecrypt.columnDecrypted')}
              </th>
              <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>{t('admin.emailDecrypt.columnError')}</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(row => (
              <tr key={row.field} style={{ borderBottom: `1px solid ${theme.colors.border.light}` }}>
                <td style={{ padding: theme.spacing.sm, verticalAlign: 'top' }}>{row.field}</td>
                <td
                  style={{
                    padding: theme.spacing.sm,
                    verticalAlign: 'top',
                    maxWidth: 200,
                    wordBreak: 'break-all',
                    fontFamily: 'monospace',
                  }}
                >
                  {row.ciphertextPreview ?? '—'}
                </td>
                <td
                  style={{
                    padding: theme.spacing.sm,
                    verticalAlign: 'top',
                    maxWidth: 360,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {row.decrypted ?? '—'}
                </td>
                <td style={{ padding: theme.spacing.sm, verticalAlign: 'top', color: theme.colors.error.main }}>
                  {row.error ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
