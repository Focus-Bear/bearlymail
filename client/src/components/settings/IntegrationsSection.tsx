import React from 'react';
import { OpenAIApiKeySection } from 'components/settings/integrations/OpenAIApiKeySection';
import { GitHubIntegrationSection } from 'components/settings/integrations/GitHubIntegrationSection';
import { GitHubRepoMappingsSection } from 'components/settings/integrations/GitHubRepoMappingsSection';
import { GitHubConnectionStatusSection } from 'components/settings/integrations/GitHubConnectionStatusSection';

interface IntegrationsSectionProps {
  openAiApiKey: string;
  showApiKey: boolean;
  apiKeySaved: boolean;
  hasGithubToken: boolean;
  onOpenAiApiKeyChange: (key: string) => void;
  onShowApiKeyChange: (show: boolean) => void;
  onSaveApiKey: () => Promise<void>;
  onRemoveApiKey: () => Promise<void>;
  onConnectGitHub: () => void;
  onDisconnectGitHub: () => Promise<void>;
}

export const IntegrationsSection: React.FC<IntegrationsSectionProps> = ({
  openAiApiKey,
  showApiKey,
  apiKeySaved,
  hasGithubToken,
  onOpenAiApiKeyChange,
  onShowApiKeyChange,
  onSaveApiKey,
  onRemoveApiKey,
  onConnectGitHub,
  onDisconnectGitHub,
}) => {
  return (
    <>
      <OpenAIApiKeySection
        openAiApiKey={openAiApiKey}
        showApiKey={showApiKey}
        apiKeySaved={apiKeySaved}
        onOpenAiApiKeyChange={onOpenAiApiKeyChange}
        onShowApiKeyChange={onShowApiKeyChange}
        onSaveApiKey={onSaveApiKey}
        onRemoveApiKey={onRemoveApiKey}
      />
      <GitHubIntegrationSection
        hasGithubToken={hasGithubToken}
        onConnectGitHub={onConnectGitHub}
        onDisconnectGitHub={onDisconnectGitHub}
      />
      <GitHubConnectionStatusSection
        hasGithubToken={hasGithubToken}
        onConnectGitHub={onConnectGitHub}
      />
      <GitHubRepoMappingsSection hasGithubToken={hasGithubToken} />
    </>
  );
};



