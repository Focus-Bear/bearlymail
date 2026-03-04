import React, { useEffect, useRef } from 'react';
import axios from 'axios';
import { theme } from 'theme/theme';

import { Sidebar } from 'components/inbox/Sidebar';
import { AccountDeletionSection } from 'components/settings/AccountDeletionSection';
import { AnalysisProgressModal } from 'components/settings/AnalysisProgressModal';
import { AutoResponderSection } from 'components/settings/auto-responder';
import { DataExportSection } from 'components/settings/DataExportSection';
import { EmailDeliverySection } from 'components/settings/EmailDeliverySection';
import { EmailSignatureSection } from 'components/settings/EmailSignatureSection';
import { GuideOurAISection } from 'components/settings/GuideOurAISection';
import { IntegrationsSection } from 'components/settings/IntegrationsSection';
import { SchedulingPreferencesSection } from 'components/settings/SchedulingPreferencesSection';
import { SetPasswordSection } from 'components/settings/SetPasswordSection';
import { SettingsHeader } from 'components/settings/SettingsHeader';
import { API_URL } from 'config/api';
import { EMOJI_MENU } from 'constants/emojis';
import { useAuth } from 'contexts/AuthContext';
import { useAutoResponder } from 'hooks/useAutoResponder';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { useSettingsData } from 'hooks/useSettingsData';
import { useSidebarState } from 'hooks/useSidebarState';

const GITHUB_CALLBACK_CONNECTED = 'connected';
const GITHUB_CALLBACK_ERROR = 'error';
const AUTO_ANALYZE_QUERY_VALUE = 'true';

const Settings: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();
  const settingsData = useSettingsData();
  const autoResponder = useAutoResponder();
  const hasTriggeredAutoAnalyze = useRef(false);
  const { isMobile, isTablet } = useResponsiveBreakpoints();
  const isNarrow = isMobile || isTablet;
  const {
    isCollapsed,
    isMobileMenuOpen,
    toggleCollapse,
    openMobileMenu,
    closeMobileMenu,
  } = useSidebarState();

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const github = params.get('github');
    if (github === GITHUB_CALLBACK_CONNECTED) {
      // Refresh GitHub token status
      settingsData.fetchApiKeys();
      // Remove query parameter from URL
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      // Show success message
      alert('GitHub connected successfully!');
    } else if (github === GITHUB_CALLBACK_ERROR) {
      // Remove query parameter from URL
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      // Show error message
      alert('Failed to connect GitHub. Please try again.');
    }
  }, [settingsData]);

  // Handle autoAnalyze query parameter from onboarding flow
  const { loading: settingsLoading, handleAnalyzeContext } = settingsData;
  useEffect(() => {
    if (settingsLoading || hasTriggeredAutoAnalyze.current) return;
    
    const params = new URLSearchParams(window.location.search);
    const autoAnalyze = params.get('autoAnalyze');
    
    if (autoAnalyze === AUTO_ANALYZE_QUERY_VALUE) {
      hasTriggeredAutoAnalyze.current = true;
      // Remove query parameter from URL but keep the hash
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      // Mark user as having scanned history (so modal doesn't show again)
      axios.put(`${API_URL}/users/me`, { hasScannedHistory: true })
        .then(() => refreshUser())
        .catch((error) => console.error('Error updating hasScannedHistory:', error));
      // Auto-trigger context analysis
      handleAnalyzeContext();
    }
  }, [settingsLoading, handleAnalyzeContext, refreshUser]);

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
      <Sidebar
        user={user}
        logout={logout}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
        isMobileMenuOpen={isMobileMenuOpen}
        onCloseMobileMenu={closeMobileMenu}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: isNarrow ? `70px ${theme.spacing.sm} ${theme.spacing.md}` : theme.spacing.xl, position: 'relative' }}>
        {isNarrow && (
          <button
            onClick={openMobileMenu}
            style={{
              position: 'fixed',
              top: theme.spacing.md,
              left: theme.spacing.md,
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: `1px solid ${theme.colors.border.medium}`,
              backgroundColor: theme.colors.background.paper,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              transition: theme.transitions.fast,
              boxShadow: theme.shadows.md,
              zIndex: 100,
            }}
            aria-label="Open navigation menu"
          >
            {EMOJI_MENU}
          </button>
        )}

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
          blockedKeywords={settingsData.blockedKeywords}
          newDeliveryTime={settingsData.newDeliveryTime}
          onFetchData={settingsData.fetchData}
          onBatchScheduleChange={settingsData.setBatchSchedule}
          onNewDeliveryTimeChange={settingsData.setNewDeliveryTime}
          onUnblockSender={settingsData.handleUnblockSender}
          onUnblockKeyword={settingsData.handleUnblockKeyword}
          onAddKeyword={settingsData.handleAddKeyword}
        />

        <AutoResponderSection
          config={autoResponder.config}
          queueStats={autoResponder.queueStats}
          onConfigChange={autoResponder.updateConfig}
          loading={autoResponder.loading}
          userName={user?.name}
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
          displayName={settingsData.displayName}
          jobTitle={settingsData.jobTitle}
          onAnalyzeContext={settingsData.handleAnalyzeContext}
          onAddToneRule={settingsData.handleAddToneRule}
          onRemoveToneRule={settingsData.handleRemoveToneRule}
          onEditToneRule={settingsData.handleEditToneRule}
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
          onUpdateProfile={settingsData.updateProfile}
        />

        <SchedulingPreferencesSection />

        <EmailSignatureSection
          emailSignature={settingsData.emailSignature}
          onSignatureChange={settingsData.setEmailSignature}
          onSave={settingsData.handleSaveEmailSignature}
          saving={settingsData.savingSignature}
        />

        <IntegrationsSection
          openAiApiKey={settingsData.openAiApiKey}
          showApiKey={settingsData.showApiKey}
          apiKeySaved={settingsData.apiKeySaved}
          hasGithubToken={settingsData.hasGithubToken}
          onOpenAiApiKeyChange={settingsData.setOpenAiApiKey}
          onShowApiKeyChange={settingsData.setShowApiKey}
          onSaveApiKey={settingsData.handleSaveApiKey}
          onRemoveApiKey={settingsData.handleRemoveApiKey}
          onConnectGitHub={settingsData.handleConnectGitHub}
          onConnectGitHubWithRepoAccess={settingsData.handleConnectGitHubWithRepoAccess}
          onDisconnectGitHub={settingsData.handleDisconnectGitHub}
        />

        <SetPasswordSection />

        <DataExportSection />

        <AccountDeletionSection />
      </div>
    </div>
  );
};

export default Settings;
