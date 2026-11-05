import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { CLAUDE_CONNECTORS_URL } from 'constants/claudeAccess';

import { claudeCodeCommand, mcpEndpointUrl } from './claudeSetupSnippets';
import { CopyableBlock } from './CopyableBlock';

const stepStyle: React.CSSProperties = {
  margin: `0 0 ${theme.spacing.xs}`,
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.primary,
};

/**
 * The no-token way in: paste the MCP URL into claude.ai as a custom connector
 * (it then works on web, desktop and mobile), or run one `claude mcp add`.
 * Claude signs in through BearlyMail's OAuth consent screen either way.
 */
export const ClaudeConnectorSetup: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div
      data-testid="claude-connector-setup"
      style={{
        padding: theme.spacing.md,
        marginBottom: theme.spacing.lg,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.background.default,
      }}
    >
      <h3
        style={{
          margin: `0 0 ${theme.spacing.sm}`,
          fontSize: theme.typography.fontSize.md,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
        }}
      >
        {t('settings.claudeAccess.connectorTitle')}
      </h3>
      <ol style={{ margin: 0, paddingLeft: theme.spacing.lg }}>
        <li style={stepStyle}>
          {t('settings.claudeAccess.connectorStepOpen')}{' '}
          <a href={CLAUDE_CONNECTORS_URL} target="_blank" rel="noopener noreferrer">
            {t('settings.claudeAccess.connectorOpenLink')}
          </a>
        </li>
        <li style={stepStyle}>{t('settings.claudeAccess.connectorStepPaste')}</li>
        <li style={stepStyle}>{t('settings.claudeAccess.connectorStepApprove')}</li>
      </ol>
      <CopyableBlock
        label={t('settings.claudeAccess.connectorUrlLabel')}
        value={mcpEndpointUrl()}
        testId="claude-connector-url"
      />
      <CopyableBlock
        label={t('settings.claudeAccess.claudeCodeOAuthLabel')}
        value={claudeCodeCommand()}
        testId="claude-code-oauth-command"
      />
    </div>
  );
};
