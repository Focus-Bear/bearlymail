import React from 'react';

import { AnthropicApiKeySection } from 'components/settings/integrations/AnthropicApiKeySection';
import { GitHubConnectionStatusSection } from 'components/settings/integrations/GitHubConnectionStatusSection';
import { GitHubIntegrationSection } from 'components/settings/integrations/GitHubIntegrationSection';
import { GitHubRepoMappingsSection } from 'components/settings/integrations/GitHubRepoMappingsSection';
import { OpenAIApiKeySection } from 'components/settings/integrations/OpenAIApiKeySection';

interface IntegrationsSectionProps {
  openAiApiKey: string;
  showApiKey: boolean;
  apiKeySaved: boolean;
  hasGithubToken: boolean;
  // Anthropic
  anthropicApiKey: string;
  showAnthropicKey: boolean;
  anthropicApiKeySaved: boolean;
  hasAnthropicKey: boolean;
  onAnthropicApiKeyChange: (key: string) => void;
  onShowAnthropicKeyChange: (show: boolean) => void;
  onSaveAnthropicKey: () => Promise<void>;
  onRemoveAnthropicKey: () => Promise<void>;
  onOpenAiApiKeyChange: (key: string) => void;
  onShowApiKeyChange: (show: boolean) => void;
  onSaveApiKey: () => Promise<void>;
  onRemoveApiKey: () => Promise<void>;
  onConnectGitHub: () => void;
  onConnectGitHubWithRepoAccess: () => void;
  onDisconnectGitHub: () => Promise<void>;
}

export const IntegrationsSection: React.FC<IntegrationsSectionProps> = ({
  openAiApiKey,
  showApiKey,
  apiKeySaved,
  hasGithubToken,
  anthropicApiKey,
  showAnthropicKey,
  anthropicApiKeySaved,
  hasAnthropicKey,
  onAnthropicApiKeyChange,
  onShowAnthropicKeyChange,
  onSaveAnthropicKey,
  onRemoveAnthropicKey,
  onOpenAiApiKeyChange,
  onShowApiKeyChange,
  onSaveApiKey,
  onRemoveApiKey,
  onConnectGitHub,
  onConnectGitHubWithRepoAccess,
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
      <AnthropicApiKeySection
        anthropicApiKey={anthropicApiKey}
        showAnthropicKey={showAnthropicKey}
        anthropicApiKeySaved={anthropicApiKeySaved}
        hasAnthropicKey={hasAnthropicKey}
        onAnthropicApiKeyChange={onAnthropicApiKeyChange}
        onShowAnthropicKeyChange={onShowAnthropicKeyChange}
        onSaveAnthropicKey={onSaveAnthropicKey}
        onRemoveAnthropicKey={onRemoveAnthropicKey}
      />
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
    </>
  );
};
