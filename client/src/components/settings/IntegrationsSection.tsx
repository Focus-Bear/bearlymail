import React from 'react';
import { useTranslation } from 'react-i18next';

import { AdvancedSettings } from 'components/settings/AdvancedSettings';
import { FocusBearConnectionSection } from 'components/settings/integrations/FocusBearConnectionSection';
import { GitHubConnectionStatusSection } from 'components/settings/integrations/GitHubConnectionStatusSection';
import { GitHubIntegrationSection } from 'components/settings/integrations/GitHubIntegrationSection';
import { GitHubRepoMappingsSection } from 'components/settings/integrations/GitHubRepoMappingsSection';
import { OwnAiAccountSection } from 'components/settings/own-ai-account/OwnAiAccountSection';

interface IntegrationsSectionProps {
  hasGithubToken: boolean;
  onConnectGitHub: () => void;
  onConnectGitHubWithRepoAccess: () => void;
  onDisconnectGitHub: () => Promise<void>;
}

/** Focus Bear, then the rarely used API keys and GitHub under a closed "Advanced" (#482). */
export const IntegrationsSection: React.FC<IntegrationsSectionProps> = ({
  hasGithubToken,
  onConnectGitHub,
  onConnectGitHubWithRepoAccess,
  onDisconnectGitHub,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <FocusBearConnectionSection />
      <AdvancedSettings summary={t('settings.advanced.integrations')}>
        <OwnAiAccountSection />
        <GitHubIntegrationSection
          hasGithubToken={hasGithubToken}
          onConnectGitHub={onConnectGitHub}
          onDisconnectGitHub={onDisconnectGitHub}
        />
        <GitHubConnectionStatusSection
          hasGithubToken={hasGithubToken}
          onConnectGitHub={onConnectGitHub}
          onConnectGitHubWithRepoAccess={onConnectGitHubWithRepoAccess}
        />
        <GitHubRepoMappingsSection hasGithubToken={hasGithubToken} />
      </AdvancedSettings>
    </>
  );
};
