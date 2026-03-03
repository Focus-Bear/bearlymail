import React, { useEffect, useRef } from 'react';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Sidebar } from 'components/inbox/Sidebar';
import { useAuth } from 'contexts/AuthContext';
import { EmailDeliverySection } from 'components/settings/EmailDeliverySection';
import { GuideOurAISection } from 'components/settings/GuideOurAISection';
import { IntegrationsSection } from 'components/settings/IntegrationsSection';
import { AccountDeletionSection } from 'components/settings/AccountDeletionSection';
import { DataExportSection } from 'components/settings/DataExportSection';
import { SettingsHeader } from 'components/settings/SettingsHeader';
import { AnalysisProgressModal } from 'components/settings/AnalysisProgressModal';
import { AutoResponderSection } from 'components/settings/auto-responder';
import { SchedulingPreferencesSection } from 'components/settings/SchedulingPreferencesSection';
import { SetPasswordSection } from 'components/settings/SetPasswordSection';
import { EmailSignatureSection } from 'components/settings/EmailSignatureSection';
import { useSettingsData } from 'hooks/useSettingsData';
import { useAutoResponder } from 'hooks/useAutoResponder';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { useSidebarState } from 'hooks/useSidebarState';
import {
  CONNECTION_STATUS_CONNECTED,
  ALERT_GITHUB_CONNECTED,
  ALERT_GITHUB_CONNECT_FAILED,
  LOADING_TEXT,
  STRING_TRUE_TEXT,
  STRING_SMOOTH,
  STRING_START,
  STRING_GITHUB_PARAM,
  STRING_ERROR,
  STRING_AUTO_ANALYZE,
  ERROR_UPDATING_HISTORY,
  STYLE_100VH,
  STRING_HIDDEN,
  STYLE_48PX,
  STYLE_1_5REM,
  ARIA_LABEL_OPEN_NAV,
} from 'constants/strings';

import { API_URL } from 'config/api';
import { EMOJI_MENU } from 'constants/emojis';

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
    const github = params.get(STRING_GITHUB_PARAM);
    if (github === CONNECTION_STATUS_CONNECTED) {
      // Refresh GitHub token status
      settingsData.fetchApiKeys();
      // Remove query parameter from URL
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      // Show success message
      alert(ALERT_GITHUB_CONNECTED);
    } else if (github === STRING_ERROR) {
      // Remove query parameter from URL
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      // Show error message
      alert(ALERT_GITHUB_CONNECT_FAILED);
    }
  }, [settingsData]);

  // Handle autoAnalyze query parameter from onboarding flow
  useEffect(() => {
    if (settingsData.loading || hasTriggeredAutoAnalyze.current) return;
    
    const params = new URLSearchParams(window.location.search);
    const autoAnalyze = params.get(STRING_AUTO_ANALYZE);
    
    if (autoAnalyze === STRING_TRUE_TEXT) {
      hasTriggeredAutoAnalyze.current = true;
      // Remove query parameter from URL but keep the hash
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      // Mark user as having scanned history (so modal doesn't show again)
      axios.put(`${API_URL}/users/me`, { hasScannedHistory: true })
        .then(() => refreshUser())
        .catch((error) => console.error(ERROR_UPDATING_HISTORY, error));
      // Auto-trigger context analysis
      settingsData.handleAnalyzeContext();
    }
  }, [settingsData.loading, settingsData.handleAnalyzeContext, refreshUser]);

  // Handle anchor scrolling when navigating with hash (from sidebar navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash && !settingsData.loading) {
        setTimeout(() => {
          const element = document.getElementById(hash.substring(1));
          if (element) {
            element.scrollIntoView({ behavior: STRING_SMOOTH, block: STRING_START });
          }
        }, 100);
      }
    };
    
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [settingsData.loading]);

  if (settingsData.loading) {
    return <div>{LOADING_TEXT}</div>;
  }

  return (
    <div style={{ display: 'flex', height: STYLE_100VH, overflow: STRING_HIDDEN }}>
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
              width: STYLE_48PX,
              height: STYLE_48PX,
              borderRadius: '50%',
              border: `1px solid ${theme.colors.border.medium}`,
              backgroundColor: theme.colors.background.paper,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: STYLE_1_5REM,
              transition: theme.transitions.fast,
              boxShadow: theme.shadows.md,
              zIndex: 100,
            }}
            aria-label={ARIA_LABEL_OPEN_NAV}
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
