import React, { useState, useCallback } from 'react';
import { ERROR_CODE_GMAIL_REQUIRED } from 'constants/strings';
import axios from 'axios';
import { theme } from 'theme/theme';
import { DebugPanel } from 'components/inbox/DebugPanel';
import { InboxOverlays } from 'components/inbox/InboxOverlays';
import { InboxHeader } from 'components/inbox/InboxHeader';
import { BulkOperationsBar } from 'components/inbox/BulkOperationsBar';
import { Sidebar } from 'components/inbox/Sidebar';
import { KeyboardHintTooltip } from 'components/inbox/KeyboardHintTooltip';
import { InboxLoadingState } from 'components/inbox/InboxLoadingState';
import { GmailConnectionScreen } from 'components/inbox/GmailConnectionScreen';
import { InboxContent } from 'components/inbox/InboxContent';
import { InboxModals } from 'components/inbox/InboxModals';
import { API_URL } from 'config/api';
import { useInboxState } from 'hooks/useInboxState';

const Inbox: React.FC = () => {
  const {
    mode,
    setMode,
    user,
    logout,
    refreshUser,
    loading,
    fetchError,
    fetchEmails,
    selectedEmailIndex,
    setSelectedEmailIndex,
    selectedEmailIds,
    setSelectedEmailIds,
    triageSuggestions,
    followUpDataMap,
    isGeneratingDrafts,
    followUpsError,
    generateDrafts,
    updateDraft,
    bulkSend,
    fetchThreadsWithDrafts,
    snoozeInput,
    onboarding,
    urgentNotification,
    debugPanel,
    modals,
    priorityTooltip,
    keyboardHint,
    splitView,
    emailActions,
    hasInitiallyLoaded,
    loadingModeSwitch,
    decrypting,
    hasRunAnalysis,
    nextDelivery,
    lastUrgentCheck,
    tabCounts,
    triageTabRef,
    actionTabRef,
    followUpTabRef,
    deliverBtnRef,
    emailListRef,
    emailDetailRef,
    handleEmailClick,
    handleEmailSelect,
    tourSteps,
    emails,
    expandedCategories,
    stableCategoryOrder,
    toggleCategory,
    updateStableCategoryOrder,
  } = useInboxState();

  const [sidebarManuallyExpanded, setSidebarManuallyExpanded] = useState(false);
  
  const handleToggleSidebarCollapse = useCallback(() => {
    if (splitView.selectedEmailId) {
      setSidebarManuallyExpanded(prev => !prev);
    }
  }, [splitView.selectedEmailId]);

  const isSidebarCollapsed = !!splitView.selectedEmailId && !sidebarManuallyExpanded;

  if (loading) {
    return <InboxLoadingState />;
  }

  if (fetchError === ERROR_CODE_GMAIL_REQUIRED) {
    return <GmailConnectionScreen />;
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: theme.colors.background.default,
      overflow: 'hidden',
    }}>
      <Sidebar user={user} logout={logout} isCollapsed={isSidebarCollapsed} onToggleCollapse={handleToggleSidebarCollapse} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        

        <InboxOverlays
          tourStep={onboarding.tourStep}
          tourSteps={tourSteps}
          onSkipTour={() => onboarding.handleSkipTour()}
          onNextTourStep={() => onboarding.handleNextTourStep(tourSteps.length)}
          triageTabRef={triageTabRef}
          actionTabRef={actionTabRef}
          deliverBtnRef={deliverBtnRef}
          showScanModal={onboarding.showScanModal}
          isScanning={onboarding.isScanning}
          onStartScan={onboarding.handleStartScan}
          onDismissScan={async () => {
            try {
              await axios.put(`${API_URL}/users/me`, { hasScannedHistory: true });
              await refreshUser();
            } catch (error) {
              console.error('Error dismissing scan prompt:', error);
            }
            onboarding.setShowScanModal(false);
          }}
          scanNotification={{ show: !!onboarding.scanProgress, progress: onboarding.scanProgress }}
          urgentNotification={urgentNotification.urgentNotification}
          onDismissUrgent={urgentNotification.hideUrgentNotification}
          needsRelogin={user?.needsRelogin}
          onLogout={logout}
        />

        <InboxHeader
          mode={mode}
          setMode={setMode}
          loadingModeSwitch={loadingModeSwitch}
          hasRunAnalysis={hasRunAnalysis}
          triageTabRef={triageTabRef}
          actionTabRef={actionTabRef}
          followUpTabRef={followUpTabRef}
          tabCounts={tabCounts}
        />

        {user?.isAdmin && (
          <DebugPanel
            mode={mode}
            emails={emails}
            isOpen={debugPanel.debugViewOpen}
            onToggle={() => debugPanel.setDebugViewOpen(!debugPanel.debugViewOpen)}
            syncStatus={debugPanel.syncStatus}
            loadingSyncStatus={debugPanel.loadingSyncStatus}
            debugStarredData={debugPanel.debugStarredData}
            loadingDebugData={debugPanel.loadingDebugData}
            onFetchDebugStarred={debugPanel.fetchDebugStarredThreads}
            debugOrphanData={debugPanel.debugOrphanData}
            loadingOrphanData={debugPanel.loadingOrphanData}
            onFetchDebugOrphan={debugPanel.fetchDebugOrphanEmails}
            fixingOrphans={debugPanel.fixingOrphans}
            onFixOrphans={() => debugPanel.handleFixOrphanEmails()}
            threadLookupResult={debugPanel.threadLookupResult}
            loadingThreadLookup={debugPanel.loadingThreadLookup}
            onLookupThread={debugPanel.lookupThread}
          />
        )}

        <BulkOperationsBar
          selectedCount={selectedEmailIds.size}
          onBulkStar={emailActions.handleBulkStar}
          onBulkArchive={emailActions.handleBulkArchive}
          onBulkMarkAsRead={emailActions.handleBulkMarkAsRead}
          onBulkMarkAsUnread={emailActions.handleBulkMarkAsUnread}
          onClearSelection={() => setSelectedEmailIds(new Set())}
        />

        {/* Keyboard Hint Tooltip */}
        {keyboardHint.showKeyboardHint && (
          <KeyboardHintTooltip action={keyboardHint.showKeyboardHint.action} />
        )}

        <InboxContent
          mode={mode}
          emails={emails}
          loading={loading}
          hasInitiallyLoaded={hasInitiallyLoaded}
          loadingModeSwitch={loadingModeSwitch}
          decrypting={decrypting}
          fetchError={fetchError}
          selectedEmailIndex={selectedEmailIndex}
          selectedEmailIds={selectedEmailIds}
          triageSuggestions={triageSuggestions}
          followUpDataMap={followUpDataMap}
          isGeneratingDrafts={isGeneratingDrafts}
          followUpsError={followUpsError}
          priorityTooltip={priorityTooltip}
          keyboardHint={keyboardHint}
          snoozeInput={snoozeInput}
          emailActions={emailActions}
          modals={modals}
          splitView={splitView}
          nextDelivery={nextDelivery}
          lastUrgentCheck={lastUrgentCheck}
          onEmailClick={handleEmailClick}
          onEmailSelect={handleEmailSelect}
          onGenerateDrafts={async () => {
            const threadIds = emails.filter(e => !e.isArchived).map(e => e.threadId);
            await generateDrafts(threadIds);
          }}
          onRetry={fetchEmails}
          updateDraft={updateDraft}
          bulkSend={bulkSend}
          fetchThreadsWithDrafts={fetchThreadsWithDrafts}
          emailListRef={emailListRef}
          emailDetailRef={emailDetailRef}
          onBulkArchive={emailActions.handleBulkArchive}
          onBulkSelect={(emailIds: string[]) => {
            setSelectedEmailIds(prev => {
              const next = new Set(prev);
              const allSelected = emailIds.every(id => next.has(id));
              if (allSelected) {
                emailIds.forEach(id => next.delete(id));
              } else {
                emailIds.forEach(id => next.add(id));
              }
              return next;
            });
          }}
          expandedCategories={expandedCategories}
          stableCategoryOrder={stableCategoryOrder}
          onToggleCategory={toggleCategory}
          onUpdateStableCategoryOrder={updateStableCategoryOrder}
          onSplitViewArchive={(archivedEmailId) => {
            // Find the archived email to get its category
            const archivedEmail = emails.find(e => e.id === archivedEmailId);
            const archivedCategory = archivedEmail?.category || 'Other';
            
            // Filter out archived emails and the just-archived email
            const visibleEmails = emails.filter(e => !e.isArchived && e.id !== archivedEmailId);
            
            if (visibleEmails.length === 0) {
              splitView.closeEmail();
              return;
            }
            
            // First, try to find the next email in the same category
            const sameCategoryEmails = visibleEmails.filter(e => (e.category || 'Other') === archivedCategory);
            
            if (sameCategoryEmails.length > 0) {
              // Open the first email in the same category
              const nextEmail = sameCategoryEmails[0];
              const nextIndex = visibleEmails.findIndex(e => e.id === nextEmail.id);
              splitView.openEmail(nextEmail.id);
              setSelectedEmailIndex(nextIndex >= 0 ? nextIndex : 0);
            } else {
              // No more emails in this category, open the first email from the next category
              const nextEmail = visibleEmails[0];
              splitView.openEmail(nextEmail.id);
              setSelectedEmailIndex(0);
            }
          }}
          onSplitViewSnooze={(snoozedEmailId) => {
            // Find the snoozed email to get its category
            const snoozedEmail = emails.find(e => e.id === snoozedEmailId);
            const snoozedCategory = snoozedEmail?.category || 'Other';
            
            // Filter out archived emails and the just-snoozed email
            const visibleEmails = emails.filter(e => !e.isArchived && e.id !== snoozedEmailId);
            
            if (visibleEmails.length === 0) {
              splitView.closeEmail();
              return;
            }
            
            // First, try to find the next email in the same category
            const sameCategoryEmails = visibleEmails.filter(e => (e.category || 'Other') === snoozedCategory);
            
            if (sameCategoryEmails.length > 0) {
              // Open the first email in the same category
              const nextEmail = sameCategoryEmails[0];
              const nextIndex = visibleEmails.findIndex(e => e.id === nextEmail.id);
              splitView.openEmail(nextEmail.id);
              setSelectedEmailIndex(nextIndex >= 0 ? nextIndex : 0);
            } else {
              // No more emails in this category, open the first email from the next category
              const nextEmail = visibleEmails[0];
              splitView.openEmail(nextEmail.id);
              setSelectedEmailIndex(0);
            }
          }}
        />
      </div>

      <InboxModals
        modals={{
          blockConfirmEmail: modals.blockConfirmEmail,
          starDiscrepancyModal: modals.starDiscrepancyModal,
          priorityOverrideModal: modals.priorityOverrideModal,
          urgencyOverrideModal: modals.urgencyOverrideModal,
          priorityFeedbackModal: modals.priorityFeedbackModal,
        }}
        onHideBlockConfirm={() => modals.hideBlockConfirm()}
        onConfirmBlockSender={emailActions.confirmBlockSender}
        onHideStarDiscrepancy={() => modals.hideStarDiscrepancy()}
        onHidePriorityOverride={() => modals.hidePriorityOverride()}
        onHideUrgencyOverride={() => modals.hideUrgencyOverride()}
        onHidePriorityFeedback={() => modals.hidePriorityFeedback()}
        onRefreshEmails={() => fetchEmails()}
      />
    </div>
  );
};

export default Inbox;
