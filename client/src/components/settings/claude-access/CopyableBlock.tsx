import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

const COPIED_RESET_MS = 2000;

const codeStyle: React.CSSProperties = {
  margin: 0,
  padding: theme.spacing.sm,
  backgroundColor: theme.colors.background.default,
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: theme.borderRadius.md,
  fontFamily: 'ui-monospace, monospace',
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.text.primary,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

interface CopyableBlockProps {
  label: string;
  value: string;
  testId: string;
}

/** A labelled snippet (token, URL, command) with a copy button. */
export const CopyableBlock: React.FC<CopyableBlockProps> = ({ label, value, testId }) => {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
    } catch (err: unknown) {
      console.error('Clipboard write failed:', err);
    }
  };

  return (
    <div style={{ marginTop: theme.spacing.md }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm }}>
        <span
          style={{
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
          }}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            padding: `2px ${theme.spacing.sm}`,
            border: `1px solid ${theme.colors.border.light}`,
            borderRadius: theme.borderRadius.sm,
            backgroundColor: theme.colors.background.paper,
            color: theme.colors.text.primary,
            fontSize: theme.typography.fontSize.xs,
            cursor: 'pointer',
          }}
        >
          {isCopied ? t('settings.claudeAccess.copied') : t('settings.claudeAccess.copy')}
        </button>
      </div>
      <pre data-testid={testId} style={{ ...codeStyle, marginTop: theme.spacing.xs }}>
        {value}
      </pre>
    </div>
  );
};
