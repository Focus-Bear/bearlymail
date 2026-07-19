import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import {
  FailedJobsPanel,
  GitHubDebugHeader,
  SilentFailuresPanel,
  StatsGrid,
  TokenTesterPanel,
} from './GitHubDebugPanels';
import { useGitHubDebugData } from './useGitHubDebugData';

export type { GitHubDebugInfo, TokenTestResult } from './GitHubDebugSection.types';

export const GitHubDebugSection: React.FC = () => {
  const { t } = useTranslation();
  const debugState = useGitHubDebugData();

  if (debugState.loading) {
    return <div style={{ textAlign: 'center', padding: theme.spacing['3xl'] }}>{t('admin.dashboard.loading')}</div>;
  }

  if (!debugState.debugInfo) {
    return (
      <div style={{ textAlign: 'center', padding: theme.spacing['3xl'], color: theme.colors.text.secondary }}>
        {t('admin.githubDebug.loadError')}
      </div>
    );
  }

  return (
    <div>
      <GitHubDebugHeader lastUpdated={debugState.lastUpdated} onRefresh={debugState.fetchDebugInfo} />

      <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.xl }}>
        {t('admin.githubDebug.description')}
      </p>

      <StatsGrid debugInfo={debugState.debugInfo} />
      <SilentFailuresPanel debugInfo={debugState.debugInfo} formatDate={debugState.formatDate} />
      <TokenTesterPanel
        testUserId={debugState.testUserId}
        setTestUserId={debugState.setTestUserId}
        testOwnerRepo={debugState.testOwnerRepo}
        setTestOwnerRepo={debugState.setTestOwnerRepo}
        testingToken={debugState.testingToken}
        handleTestToken={debugState.handleTestToken}
        tokenTestResult={debugState.tokenTestResult}
      />
      <FailedJobsPanel debugInfo={debugState.debugInfo} formatDate={debugState.formatDate} />
    </div>
  );
};
