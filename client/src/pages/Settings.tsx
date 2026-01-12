import React, { useEffect } from 'react';
import { theme } from 'theme/theme';
import { Sidebar } from 'components/inbox/Sidebar';
import { useAuth } from 'contexts/AuthContext';
import { EmailDeliverySection } from 'components/settings/EmailDeliverySection';
import { GuideOurAISection } from 'components/settings/GuideOurAISection';
import { IntegrationsSection } from 'components/settings/IntegrationsSection';
import { SettingsHeader } from 'components/settings/SettingsHeader';
import { AnalysisProgressModal } from 'components/settings/AnalysisProgressModal';
import { useSettingsData } from 'hooks/useSettingsData';

const Settings: React.FC = () => {
  const { user, logout } = useAuth();
  const settingsData = useSettingsData();

  // Handle anchor scrolling when navigating with hash (from sidebar navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash && !settingsData.loading) {
        setTimeout(() => {
          const element = document.getElementById(hash.substring(1));
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      }
    };
    
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [settingsData.loading]);

  if (settingsData.loading) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar user={user} logout={logout} />
      <div style={{ flex: 1, overflowY: 'auto', padding: theme.spacing.xl, position: 'relative' }}>
        <AnalysisProgressModal
          analyzeProgress={settingsData.analyzeProgress}
          onDismiss={settingsData.dismissAnalyzeProgress}
        />

        <SettingsHeader />

        <EmailDeliverySection
          googleAccounts={settingsData.googleAccounts}
          office365Accounts={settingsData.office365Accounts}
          zohoAccounts={settingsData.zohoAccounts}
          batchSchedule={settingsData.batchSchedule}
          blockedSenders={settingsData.blockedSenders}
          newDeliveryTime={settingsData.newDeliveryTime}
          onFetchData={settingsData.fetchData}
          onBatchScheduleChange={settingsData.setBatchSchedule}
          onNewDeliveryTimeChange={settingsData.setNewDeliveryTime}
          onUnblockSender={settingsData.handleUnblockSender}
        />

        <GuideOurAISection
          contexts={settingsData.contexts}
          toneRules={settingsData.toneRules}
          summarizationRules={settingsData.summarizationRules}
          analyzing={settingsData.analyzing}
          newToneRule={settingsData.newToneRule}
          newSummarizationWhen={settingsData.newSummarizationWhen}
          newSummarizationHow={settingsData.newSummarizationHow}
          editingSummarizationRule={settingsData.editingSummarizationRule}
          editSummarizationWhen={settingsData.editSummarizationWhen}
          editSummarizationHow={settingsData.editSummarizationHow}
          newContextValue={settingsData.newContextValue}
          newContextPriority={settingsData.newContextPriority}
          addingContextType={settingsData.addingContextType}
          editingContextId={settingsData.editingContextId}
          editContextValue={settingsData.editContextValue}
          editContextPriority={settingsData.editContextPriority}
          onAnalyzeContext={settingsData.handleAnalyzeContext}
          onAddToneRule={settingsData.handleAddToneRule}
          onRemoveToneRule={settingsData.handleRemoveToneRule}
          onNewToneRuleChange={settingsData.setNewToneRule}
          onAddSummarizationRule={settingsData.handleAddSummarizationRule}
          onEditSummarizationRule={settingsData.handleEditSummarizationRule}
          onSaveSummarizationRule={settingsData.handleSaveSummarizationRule}
          onDeleteSummarizationRule={settingsData.handleDeleteSummarizationRule}
          onNewSummarizationWhenChange={settingsData.setNewSummarizationWhen}
          onNewSummarizationHowChange={settingsData.setNewSummarizationHow}
          onEditSummarizationWhenChange={settingsData.setEditSummarizationWhen}
          onEditSummarizationHowChange={settingsData.setEditSummarizationHow}
          onEditingSummarizationRuleChange={settingsData.setEditingSummarizationRule}
          onAddContext={settingsData.handleAddContext}
          onUpdateContext={settingsData.handleUpdateContext}
          onDeleteContext={settingsData.handleDeleteContext}
          onNewContextValueChange={settingsData.setNewContextValue}
          onNewContextPriorityChange={settingsData.setNewContextPriority}
          onAddingContextTypeChange={settingsData.setAddingContextType}
          onEditingContextIdChange={settingsData.setEditingContextId}
          onEditContextValueChange={settingsData.setEditContextValue}
          onEditContextPriorityChange={settingsData.setEditContextPriority}
        />

        <IntegrationsSection
          openAiApiKey={settingsData.openAiApiKey}
          showApiKey={settingsData.showApiKey}
          apiKeySaved={settingsData.apiKeySaved}
          githubToken={settingsData.githubToken}
          showGithubToken={settingsData.showGithubToken}
          githubTokenSaved={settingsData.githubTokenSaved}
          hasGithubToken={settingsData.hasGithubToken}
          onOpenAiApiKeyChange={settingsData.setOpenAiApiKey}
          onShowApiKeyChange={settingsData.setShowApiKey}
          onSaveApiKey={settingsData.handleSaveApiKey}
          onRemoveApiKey={settingsData.handleRemoveApiKey}
          onGithubTokenChange={settingsData.setGithubToken}
          onShowGithubTokenChange={settingsData.setShowGithubToken}
          onSaveGithubToken={settingsData.handleSaveGithubToken}
          onRemoveGithubToken={settingsData.handleRemoveGithubToken}
        />
      </div>
    </div>
  );
};

export default Settings;
