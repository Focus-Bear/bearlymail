import React from 'react';
import axios from 'axios';
import { theme } from 'theme/theme';

import { ArchiveConfirmationToast } from 'components/inbox/ArchiveConfirmationToast';
import { BulkOperationsBar } from 'components/inbox/BulkOperationsBar';
import { DebugPanel } from 'components/inbox/DebugPanel';
import { GmailConnectionScreen } from 'components/inbox/GmailConnectionScreen';
import { InboxContent } from 'components/inbox/InboxContent';
import { InboxFilters } from 'components/inbox/InboxFilters';
import { InboxHeader } from 'components/inbox/InboxHeader';
import { InboxLoadingState } from 'components/inbox/InboxLoadingState';
import { InboxModals } from 'components/inbox/InboxModals';
import { InboxOverlays } from 'components/inbox/InboxOverlays';
import { KeyboardHintTooltip } from 'components/inbox/KeyboardHintTooltip';
import { Sidebar } from 'components/inbox/Sidebar';
import { API_URL } from 'config/api';
import { CATEGORY_OTHER, ERROR_CODE_GMAIL_REQUIRED } from 'constants/strings';
import { useDebugMode } from 'hooks/useDebugMode';
import { useInboxFilters } from 'hooks/useInboxFilters';
import { useInboxState } from 'hooks/useInboxState';
import { usePriorityCounts } from 'hooks/usePriorityCounts';
import { useSidebarState } from 'hooks/useSidebarState';

interface SplitViewNavContext {
  emails: any[];
  splitView: { openEmail: (id: string) => void; closeEmail: () => void };
  setSelectedEmailIndex: (index: number) => void;
}

function navigateToNextEmailAfterAction(removedEmailId: string, context: SplitViewNavContext): void {
  const { emails, splitView, setSelectedEmailIndex } = context;
  const removedEmail = emails.find(event => event.id === removedEmailId);
  const removedCategory = removedEmail?.category || CATEGORY_OTHER;
  const visibleEmails = emails.filter(event => !event.isArchived && event.id !== removedEmailId);

  if (visibleEmails.length === 0) {
    splitView.closeEmail();
    return;
  }

  const sameCategoryEmails = visibleEmails.filter(
    event => (event.category || CATEGORY_OTHER) === removedCategory
  );

  if (sameCategoryEmails.length > 0) {
    const nextEmail = sameCategoryEmails[0];
    const nextIndex = visibleEmails.findIndex(event => event.id === nextEmail.id);
    splitView.openEmail(nextEmail.id);
    setSelectedEmailIndex(nextIndex >= 0 ? nextIndex : 0);
  } else {
    splitView.openEmail(visibleEmails[0].id);
    setSelectedEmailIndex(0);
  }
}


interface InboxViewProps {
  inboxState: ReturnType<typeof useInboxState>;
  filterState: ReturnType<typeof useInboxFilters>;
  sidebarState: {
    isSidebarCollapsed: boolean;
    isMobileMenuOpen: boolean;
    handleToggleSidebarCollapse: () => void;
    openMobileMenu: () => void;
    handleCloseMobileMenu: () => void;
  };
}

const InboxView: React.FC<InboxViewProps> = ({ inboxState, filterState, sidebarState }) => {
  const {
    mode, setMode, user, logout, refreshUser, fetchEmails, fetchCategoryEmails,
    selectedEmailIndex, setSelectedEmailIndex, selectedEmailIds, setSelectedEmailIds,
    triageSuggestions, actionTabPulsing, setActionTabPulsing,
    followUpDataMap, isGeneratingDrafts, followUpsError, generateDrafts,
    updateDraft, bulkSend, fetchThreadsWithDrafts, snoozeInput, onboarding, urgentNotification,
    debugPanel, modals, priorityTooltip, keyboardHint, splitView, emailActions, keyboardShortcuts,
    hasInitiallyLoaded, loadingModeSwitch, loading, decrypting, fetchError,
    nextDelivery, lastUrgentCheck, tabCounts, triageTabRef, actionTabRef, followUpTabRef,
    deliverBtnRef, emailListRef, emailDetailRef, handleEmailClick, handleEmailSelect, tourSteps,
    emails, loadMore, hasMore, expandedCategories, stableCategoryOrder, toggleCategory,
    updateStableCategoryOrder, categorySummary, loadedCategoryNames, loadingCategoryNames,
  } = inboxState;
  const {
    isFilterBarVisible, filters, connectedAccounts, availableCategories, loadingAccounts,
    loadingCategories, hasActiveFilters, toggleFilterBar, setAccountFilter, setCategoryFilter,
    setPriorityFilter, clearFilters,
  } = filterState;
  const { isSidebarCollapsed, isMobileMenuOpen, handleToggleSidebarCollapse, openMobileMenu, handleCloseMobileMenu } = sidebarState;
  const { isDebugModeEnabled } = useDebugMode();
  const { counts: priorityCounts, fetchCounts: fetchPriorityCounts } = usePriorityCounts();
  const activeFilterCount =
    (filters.accountIds.length > 0 ? 1 : 0) +
    (filters.categories.length > 0 ? 1 : 0) +
    (filters.minPriority !== null ? 1 : 0);
  const splitViewNavCtx = { emails, splitView, setSelectedEmailIndex };

  return (
    <div className="h-dvh" style={{ display: 'flex', backgroundColor: theme.colors.background.default, overflow: 'hidden' }}>
      <Sidebar user={user} logout={logout} isCollapsed={isSidebarCollapsed} onToggleCollapse={handleToggleSidebarCollapse} isMobileMenuOpen={isMobileMenuOpen} onCloseMobileMenu={handleCloseMobileMenu} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', minWidth: 0 }}>
        <InboxOverlays
          tourStep={onboarding.tourStep} tourSteps={tourSteps}
          onSkipTour={() => onboarding.handleSkipTour()}
          onNextTourStep={() => onboarding.handleNextTourStep(tourSteps.length)}
          triageTabRef={triageTabRef} actionTabRef={actionTabRef} deliverBtnRef={deliverBtnRef}
          showScanModal={onboarding.showScanModal} isScanning={onboarding.isScanning}
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
          needsRelogin={user?.needsRelogin} onLogout={logout}
        />
        <InboxHeader
          mode={mode} setMode={setMode} loadingModeSwitch={loadingModeSwitch}
          triageTabRef={triageTabRef} actionTabRef={actionTabRef} followUpTabRef={followUpTabRef} tabCounts={tabCounts}
          actionTabPulsing={actionTabPulsing} onActionTabPulseEnd={() => setActionTabPulsing(false)}
          onToggleMobileMenu={openMobileMenu} isFilterBarVisible={isFilterBarVisible}
          hasActiveFilters={hasActiveFilters} activeFilterCount={activeFilterCount} onToggleFilterBar={toggleFilterBar}
          onClearFilters={() => {
            clearFilters();
            fetchEmails();
          }}
          isAdmin={user?.isAdmin} debugViewOpen={debugPanel.debugViewOpen}
          onToggleDebug={() => debugPanel.setDebugViewOpen(!debugPanel.debugViewOpen)}
          onViewBlockedEmails={() => setMode('blocked')}
          onViewAutoRespondedEmails={() => setMode('autoresponded')}
        />
        <InboxFilters
          onFilterChange={fetchEmails} isFilterBarVisible={isFilterBarVisible} filters={filters}
          connectedAccounts={connectedAccounts} availableCategories={availableCategories}
          loadingAccounts={loadingAccounts} loadingCategories={loadingCategories}
          hasActiveFilters={hasActiveFilters} setAccountFilter={setAccountFilter}
          setCategoryFilter={setCategoryFilter} setPriorityFilter={setPriorityFilter}
        />
        {(user?.isAdmin || isDebugModeEnabled) && debugPanel.debugViewOpen && (
          <DebugPanel
            mode={mode} emails={emails} allEmails={debugPanel.allEmails} loadingAllEmails={debugPanel.loadingAllEmails}
            isOpen={debugPanel.debugViewOpen} onToggle={() => debugPanel.setDebugViewOpen(!debugPanel.debugViewOpen)}
            onFetchAllEmails={() => debugPanel.fetchAllEmails(mode)} syncStatus={debugPanel.syncStatus}
            loadingSyncStatus={debugPanel.loadingSyncStatus} syncHistory={debugPanel.syncHistory}
            loadingSyncHistory={debugPanel.loadingSyncHistory} onFetchSyncHistory={debugPanel.fetchSyncHistory}
            debugStarredData={debugPanel.debugStarredData} loadingDebugData={debugPanel.loadingDebugData}
            onFetchDebugStarred={debugPanel.fetchDebugStarredThreads} debugOrphanData={debugPanel.debugOrphanData}
            loadingOrphanData={debugPanel.loadingOrphanData} onFetchDebugOrphan={debugPanel.fetchDebugOrphanEmails}
            fixingOrphans={debugPanel.fixingOrphans} onFixOrphans={() => debugPanel.handleFixOrphanEmails()}
            threadLookupResult={debugPanel.threadLookupResult} loadingThreadLookup={debugPanel.loadingThreadLookup}
            onLookupThread={debugPanel.lookupThread} categorySummary={categorySummary}
            loadedCategoryNames={loadedCategoryNames} loadingCategoryNames={loadingCategoryNames}
            expandedCategories={expandedCategories}
          />
        )}
        <BulkOperationsBar selectedCount={selectedEmailIds.size} onBulkArchive={emailActions.handleBulkArchive} onClearSelection={() => setSelectedEmailIds(new Set())} />
        {keyboardHint.showKeyboardHint && <KeyboardHintTooltip action={keyboardHint.showKeyboardHint.action} />}
        {keyboardShortcuts.pendingArchive && (
          <ArchiveConfirmationToast
            emailCount={keyboardShortcuts.pendingArchive.emailIds.length}
            onConfirm={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y' }));
            }}
            onCancel={keyboardShortcuts.cancelPendingArchive}
          />
        )}
        <InboxContent
          mode={mode} emails={emails} loading={loading} hasInitiallyLoaded={hasInitiallyLoaded}
          loadingModeSwitch={loadingModeSwitch} decrypting={decrypting} fetchError={fetchError}
          selectedEmailIndex={selectedEmailIndex} selectedEmailIds={selectedEmailIds}
          triageSuggestions={triageSuggestions} followUpDataMap={followUpDataMap}
          isGeneratingDrafts={isGeneratingDrafts} followUpsError={followUpsError}
          priorityTooltip={priorityTooltip} keyboardHint={keyboardHint} snoozeInput={snoozeInput}
          emailActions={emailActions} modals={modals} splitView={splitView}
          nextDelivery={nextDelivery} lastUrgentCheck={lastUrgentCheck}
          onEmailClick={handleEmailClick} onEmailSelect={handleEmailSelect}
          onGenerateDrafts={async () => {
            const threadIds = emails.filter(email => !email.isArchived).map(email => email.threadId);
            await generateDrafts(threadIds);
          }}
          onRetry={fetchEmails} updateDraft={updateDraft} bulkSend={bulkSend}
          fetchThreadsWithDrafts={fetchThreadsWithDrafts} emailListRef={emailListRef} emailDetailRef={emailDetailRef}
          onBulkArchive={async (emailIds: string[]) => {
            await emailActions.handleBulkArchiveByIds(emailIds);
            fetchPriorityCounts();
          }} expandedCategories={expandedCategories}
          stableCategoryOrder={stableCategoryOrder} onToggleCategory={toggleCategory}
          onUpdateStableCategoryOrder={updateStableCategoryOrder} onLoadMore={loadMore} hasMore={hasMore}
          categorySummary={categorySummary} loadedCategoryNames={loadedCategoryNames}
          loadingCategoryNames={loadingCategoryNames} fetchCategoryEmails={fetchCategoryEmails}
          minPriority={filters.minPriority}
          priorityCounts={priorityCounts}
          onUnlockPriorityTier={(newMinPriority: number) => {
            setPriorityFilter(newMinPriority);
            fetchEmails();
            fetchPriorityCounts();
          }}
          onDismissUnlockPrompt={() => {
            // Keep current priority tier — do not change minPriority
          }}
          onSplitViewArchive={id => navigateToNextEmailAfterAction(id, splitViewNavCtx)}
          onSplitViewSnooze={id => navigateToNextEmailAfterAction(id, splitViewNavCtx)}
          onSplitViewPrioritySet={(id, count) => {
            const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
            emailActions.handleSetStarCount(id, count, fakeEvent);
            navigateToNextEmailAfterAction(id, splitViewNavCtx);
          }}
        />
      </div>
      <InboxModals
        modals={{ blockConfirmEmail: modals.blockConfirmEmail, starDiscrepancyModal: modals.starDiscrepancyModal, priorityOverrideModal: modals.priorityOverrideModal, urgencyOverrideModal: modals.urgencyOverrideModal, priorityFeedbackModal: modals.priorityFeedbackModal }}
        onHideBlockConfirm={() => modals.hideBlockConfirm()} onConfirmBlockSender={emailActions.confirmBlockSender}
        onHideStarDiscrepancy={() => modals.hideStarDiscrepancy()} onHidePriorityOverride={() => modals.hidePriorityOverride()}
        onHideUrgencyOverride={() => modals.hideUrgencyOverride()} onHidePriorityFeedback={() => modals.hidePriorityFeedback()}
        onRefreshEmails={() => fetchEmails()}
      />
    </div>
  );
};

const Inbox: React.FC = () => {
  const inboxState = useInboxState();
  const filterState = useInboxFilters();
  const { isCollapsed: isSidebarCollapsed, isMobileMenuOpen, toggleCollapse: handleToggleSidebarCollapse, openMobileMenu, closeMobileMenu: handleCloseMobileMenu } = useSidebarState({ splitViewActive: !!inboxState.splitView.selectedEmailId });

  if (inboxState.loading) {
    return <InboxLoadingState />;
  }

  if (inboxState.fetchError === ERROR_CODE_GMAIL_REQUIRED) {
    return <GmailConnectionScreen />;
  }

  return (
    <InboxView
      inboxState={inboxState}
      filterState={filterState}
      sidebarState={{ isSidebarCollapsed, isMobileMenuOpen, handleToggleSidebarCollapse, openMobileMenu, handleCloseMobileMenu }}
    />
  );
};

export default Inbox;
