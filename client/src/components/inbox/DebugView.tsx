import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';

interface DebugViewProps {
  emails: Email[];
}

export const DebugView: React.FC<DebugViewProps> = ({ emails }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        padding: theme.spacing.md,
        borderTop: `1px solid ${theme.colors.border.light}`,
        marginTop: theme.spacing.xl,
      }}
    >
      <details>
        <summary style={{ cursor: 'pointer', color: theme.colors.text.secondary }}>{t('debug.view.title')}</summary>
        <pre
          style={{
            backgroundColor: theme.colors.background.subtle,
            padding: theme.spacing.md,
            borderRadius: theme.borderRadius.md,
            fontSize: '12px',
            overflow: 'auto',
          }}
        >
          {JSON.stringify(emails, null, 2)}
        </pre>
      </details>
    </div>
  );
};
