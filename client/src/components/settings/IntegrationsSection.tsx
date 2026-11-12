import React from 'react';

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

export const IntegrationsSection: React.FC<IntegrationsSectionProps> = ({
  hasGithubToken,
  onConnectGitHub,
  onConnectGitHubWithRepoAccess,
  onDisconnectGitHub,
}) => {
  return (
    <>
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
      <FocusBearConnectionSection />
    </>
  );
};
