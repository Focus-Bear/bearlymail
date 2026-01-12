import React from 'react';
import { OpenAIApiKeySection } from 'components/settings/integrations/OpenAIApiKeySection';
import { GitHubIntegrationSection } from 'components/settings/integrations/GitHubIntegrationSection';

interface IntegrationsSectionProps {
  openAiApiKey: string;
  showApiKey: boolean;
  apiKeySaved: boolean;
  githubToken: string;
  showGithubToken: boolean;
  githubTokenSaved: boolean;
  hasGithubToken: boolean;
  onOpenAiApiKeyChange: (key: string) => void;
  onShowApiKeyChange: (show: boolean) => void;
  onSaveApiKey: () => Promise<void>;
  onRemoveApiKey: () => Promise<void>;
  onGithubTokenChange: (token: string) => void;
  onShowGithubTokenChange: (show: boolean) => void;
  onSaveGithubToken: () => Promise<void>;
  onRemoveGithubToken: () => Promise<void>;
}

export const IntegrationsSection: React.FC<IntegrationsSectionProps> = ({
  openAiApiKey,
  showApiKey,
  apiKeySaved,
  githubToken,
  showGithubToken,
  githubTokenSaved,
  hasGithubToken,
  onOpenAiApiKeyChange,
  onShowApiKeyChange,
  onSaveApiKey,
  onRemoveApiKey,
  onGithubTokenChange,
  onShowGithubTokenChange,
  onSaveGithubToken,
  onRemoveGithubToken,
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
        githubToken={githubToken}
        showGithubToken={showGithubToken}
        githubTokenSaved={githubTokenSaved}
        hasGithubToken={hasGithubToken}
        onGithubTokenChange={onGithubTokenChange}
        onShowGithubTokenChange={onShowGithubTokenChange}
        onSaveGithubToken={onSaveGithubToken}
        onRemoveGithubToken={onRemoveGithubToken}
      />
    </>
  );
};



