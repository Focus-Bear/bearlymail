import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { claudeCodeCommand, claudeDesktopConfig } from './claudeSetupSnippets';
import { CopyableBlock } from './CopyableBlock';

interface NewTokenPanelProps {
  token: string;
  onDismiss: () => void;
}

/** Shows a freshly created token once, with ready-to-paste setup for Claude. */
export const NewTokenPanel: React.FC<NewTokenPanelProps> = ({ token, onDismiss }) => {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      data-testid="new-access-token-panel"
      style={{
        padding: theme.spacing.md,
        marginBottom: theme.spacing.lg,
        border: `1px solid ${theme.colors.warning.main}`,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.warning.light,
      }}
    >
      <p style={{ margin: 0, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.primary }}>
        <strong>{t('settings.claudeAccess.newTokenTitle')}</strong> {t('settings.claudeAccess.newTokenWarning')}
      </p>
      <CopyableBlock label={t('settings.claudeAccess.tokenLabel')} value={token} testId="new-access-token-value" />
      <CopyableBlock
        label={t('settings.claudeAccess.claudeCodeLabel')}
        value={claudeCodeCommand(token)}
        testId="claude-code-command"
      />
      <CopyableBlock
        label={t('settings.claudeAccess.claudeDesktopLabel')}
        value={claudeDesktopConfig(token)}
        testId="claude-desktop-config"
      />
      <button
        type="button"
        onClick={onDismiss}
        style={{
          marginTop: theme.spacing.md,
          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.md,
          backgroundColor: theme.colors.background.paper,
          color: theme.colors.text.primary,
          fontSize: theme.typography.fontSize.sm,
          cursor: 'pointer',
        }}
      >
        {t('settings.claudeAccess.dismiss')}
      </button>
    </div>
  );
};
