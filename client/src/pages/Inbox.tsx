import React from 'react';
import { ERROR_CODE_GMAIL_REQUIRED } from 'constants/strings';
import axios from 'axios';
import { theme } from 'theme/theme';
import { DebugPanel } from 'components/inbox/DebugPanel';
import { InboxOverlays } from 'components/inbox/InboxOverlays';
import { InboxHeader } from 'components/inbox/InboxHeader';
import { BulkOperationsBar } from 'components/inbox/BulkOperationsBar';
import { Sidebar } from 'components/inbox/Sidebar';
import { KeyboardHintTooltip } from 'components/inbox/KeyboardHintTooltip';
import { ArchiveConfirmationToast } from 'components/inbox/ArchiveConfirmationToast';
import { InboxLoadingState } from 'components/inbox/InboxLoadingState';
import { GmailConnectionScreen } from 'components/inbox/GmailConnectionScreen';
import { InboxContent } from 'components/inbox/InboxContent';
import { InboxModals } from 'components/inbox/InboxModals';
import { InboxFilters } from 'components/inbox/InboxFilters';
import { API_URL } from 'config/api';
import { useInboxState } from 'hooks/useInboxState';
import { useInboxFilters } from 'hooks/useInboxFilters';
import { useSidebarState } from 'hooks/useSidebarState';

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
    keyboardShortcuts,
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
    loadMore,
    hasMore,
    expandedCategories,
    stableCategoryOrder,
    toggleCategory,
    updateStableCategoryOrder,
    categorySummary,
    loadedCategoryNames,
    loadingCategoryNames,
  } = useInboxState();

  const {
    isFilterBarVisible,
    filters,
    connectedAccounts,
    availableCategories,
    loadingAccounts,
    loadingCategories,
    hasActiveFilters,
    toggleFilterBar,
    setAccountFilter,
    setCategoryFilter,
    setPriorityFilter,
    clearFilters,
  } = useInboxFilters();

  const activeFilterCount =
    (filters.accountIds.length > 0 ? 1 : 0) +
    (filters.categories.length > 0 ? 1 : 0) +
    (filters.minPriority !== null ? 1 : 0);

  const {
    isCollapsed: isSidebarCollapsed,
    isMobileMenuOpen,
    toggleCollapse: handleToggleSidebarCollapse,
    openMobileMenu,
    closeMobileMenu: handleCloseMobileMenu,
  } = useSidebarState({ splitViewActive: !!splitView.selectedEmailId });

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
      <Sidebar
        user={user}
        logout={logout}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
        isMobileMenuOpen={isMobileMenuOpen}
        onCloseMobileMenu={handleCloseMobileMenu}
      />

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
          onToggleMobileMenu={openMobileMenu}
          isFilterBarVisible={isFilterBarVisible}
          hasActiveFilters={hasActiveFilters}
          activeFilterCount={activeFilterCount}
          onToggleFilterBar={toggleFilterBar}
          onClearFilters={() => { clearFilters(); fetchEmails(); }}
          isAdmin={user?.isAdmin}
          debugViewOpen={debugPanel.debugViewOpen}
          onToggleDebug={() => debugPanel.setDebugViewOpen(!debugPanel.debugViewOpen)}
          onViewBlockedEmails={() => setMode('blocked')}
        />

        <InboxFilters
          onFilterChange={fetchEmails}
          isFilterBarVisible={isFilterBarVisible}
          filters={filters}
          connectedAccounts={connectedAccounts}
          availableCategories={availableCategories}
          loadingAccounts={loadingAccounts}
          loadingCategories={loadingCategories}
          hasActiveFilters={hasActiveFilters}
          setAccountFilter={setAccountFilter}
          setCategoryFilter={setCategoryFilter}
          setPriorityFilter={setPriorityFilter}
        />

        {user?.isAdmin && debugPanel.debugViewOpen && (
          <DebugPanel
            mode={mode}
            emails={emails}
            allEmails={debugPanel.allEmails}
            loadingAllEmails={debugPanel.loadingAllEmails}
            isOpen={debugPanel.debugViewOpen}
            onToggle={() => debugPanel.setDebugViewOpen(!debugPanel.debugViewOpen)}
            onFetchAllEmails={() => debugPanel.fetchAllEmails(mode)}
            syncStatus={debugPanel.syncStatus}
            loadingSyncStatus={debugPanel.loadingSyncStatus}
            syncHistory={debugPanel.syncHistory}
            loadingSyncHistory={debugPanel.loadingSyncHistory}
            onFetchSyncHistory={debugPanel.fetchSyncHistory}
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
            categorySummary={categorySummary}
            loadedCategoryNames={loadedCategoryNames}
            loadingCategoryNames={loadingCategoryNames}
            expandedCategories={expandedCategories}
          />
        )}

        <BulkOperationsBar
          selectedCount={selectedEmailIds.size}
          onBulkArchive={emailActions.handleBulkArchive}
          onClearSelection={() => setSelectedEmailIds(new Set())}
        />

        {/* Keyboard Hint Tooltip */}
        {keyboardHint.showKeyboardHint && (
          <KeyboardHintTooltip action={keyboardHint.showKeyboardHint.action} />
        )}

        {/* Archive Confirmation Toast */}
        {keyboardShortcuts.pendingArchive && (
          <ArchiveConfirmationToast
            emailCount={keyboardShortcuts.pendingArchive.emailIds.length}
            onConfirm={() => {
              // The confirmation is handled by pressing 'y' in the keyboard handler
              // This button is a fallback for clicking
              const event = new KeyboardEvent('keydown', { key: 'y' });
              window.dispatchEvent(event);
            }}
            onCancel={keyboardShortcuts.cancelPendingArchive}
          />
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
          onBulkArchive={emailActions.handleBulkArchiveByIds}
          expandedCategories={expandedCategories}
          stableCategoryOrder={stableCategoryOrder}
          onToggleCategory={toggleCategory}
          onUpdateStableCategoryOrder={updateStableCategoryOrder}
          onLoadMore={loadMore}
          hasMore={hasMore}
          categorySummary={categorySummary}
          loadedCategoryNames={loadedCategoryNames}
          loadingCategoryNames={loadingCategoryNames}
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
          onSplitViewPrioritySet={(prioritizedEmailId, starCount) => {
            // Trigger the exit animation on the triage list item (same as clicking priority in the list)
            const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
            emailActions.handleSetStarCount(prioritizedEmailId, starCount, fakeEvent);

            // Navigate to next email in same category (same pattern as archive/snooze)
            const prioritizedEmail = emails.find(e => e.id === prioritizedEmailId);
            const prioritizedCategory = prioritizedEmail?.category || 'Other';
            const visibleEmails = emails.filter(e => !e.isArchived && e.id !== prioritizedEmailId);

            if (visibleEmails.length === 0) {
              splitView.closeEmail();
              return;
            }

            const sameCategoryEmails = visibleEmails.filter(e => (e.category || 'Other') === prioritizedCategory);

            if (sameCategoryEmails.length > 0) {
              const nextEmail = sameCategoryEmails[0];
              const nextIndex = visibleEmails.findIndex(e => e.id === nextEmail.id);
              splitView.openEmail(nextEmail.id);
              setSelectedEmailIndex(nextIndex >= 0 ? nextIndex : 0);
            } else {
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
