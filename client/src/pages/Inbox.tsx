import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { theme } from 'theme/theme';

import { AnalysingPriorityCategory } from 'components/inbox/AnalysingPriorityCategory';
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
import { PrioritisationInterstitial } from 'components/inbox/states';
import { API_URL } from 'config/api';
import { PRIORITY_BUCKET_DEFS } from 'constants/priorityBuckets';
import { CATEGORY_OTHER, ERROR_CODE_GMAIL_REQUIRED } from 'constants/strings';
import { useInboxActions, useInboxData, useInboxFiltersCtx, useInboxUI } from 'contexts/InboxContext';
import { InboxProvider } from 'contexts/InboxProvider';
import { useDebugMode } from 'hooks/useDebugMode';
import { VERY_HIGH_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';
import { GATE_FILTER_SWITCHED_KEY, usePrioritisationGate } from 'hooks/usePrioritisationGate';
import { usePriorityCounts } from 'hooks/usePriorityCounts';
import { useSidebarState } from 'hooks/useSidebarState';
import { selectSummaryLoading } from 'store/selectors/emailSelectors';

function navigateToNextEmailAfterAction(
  removedEmailId: string,
  emails: any[],
  splitView: { openEmail: (id: string) => void; closeEmail: () => void },
  setSelectedEmailIndex: (index: number) => void,
): void {
  const removedEmail = emails.find(event => event.id === removedEmailId);
  // Prefer category_id (UUID) as stable group key (fixes #1293 — display name is fallback).
  const removedCategory = removedEmail?.category_id ?? removedEmail?.category ?? CATEGORY_OTHER;
  const visibleEmails = emails.filter(event => !event.isArchived && event.id !== removedEmailId);

  if (visibleEmails.length === 0) {
    splitView.closeEmail();
    return;
  }

  const sameCategoryEmails = visibleEmails.filter(
    event => (event.category_id ?? event.category ?? CATEGORY_OTHER) === removedCategory
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

const InboxView: React.FC = () => {
  const {
    emails,
    loading,
    decrypting,
    loadingModeSwitch,
    fetchError,
    hasMore,
    hasInitiallyLoaded,
    categorySummary,
    loadedCategoryNames,
    loadingCategoryNames,
    triageSuggestions,
    followUpDataMap,
    isGeneratingDrafts,
    followUpsError,
    tabCounts,
    nextDelivery,
    lastUrgentCheck,
    selectedEmailIndex,
    selectedEmailIds,
    actionTabPulsing,
    expandedCategories,
    stableCategoryOrder,
    user,
  } = useInboxData();

  const {
    splitView,
    modals,
    snoozeInput,
    priorityTooltip,
    keyboardHint,
    debugPanel,
    onboarding,
    urgentNotification,
    keyboardShortcuts,
    tourSteps,
    triageTabRef,
    actionTabRef,
    followUpTabRef,
    deliverBtnRef,
    emailListRef,
    emailDetailRef,
  } = useInboxUI();

  const {
    emailActions,
    fetchEmails,
    loadMore,
    fetchCategoryEmails,
    handleEmailClick,
    handleEmailSelect,
    generateDrafts,
    updateDraft,
    bulkSend,
    fetchThreadsWithDrafts,
    toggleCategory,
    updateStableCategoryOrder,
    setSelectedEmailIndex,
    setSelectedEmailIds,
    setActionTabPulsing,
    logout,
    refreshUser,
    setMode,
  } = useInboxActions();

  const {
    mode,
    inboxFilters: {
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
    },
  } = useInboxFiltersCtx();

  const { isCollapsed: isSidebarCollapsed, isMobileMenuOpen, toggleCollapse: handleToggleSidebarCollapse, openMobileMenu, closeMobileMenu: handleCloseMobileMenu } = useSidebarState({ splitViewActive: !!splitView.selectedEmailId });

  const { isDebugModeEnabled } = useDebugMode();
  // Pass current inbox mode so bucket counts match the tab total (fix #1452 bug 3).
  const { counts: priorityCounts, fetchCounts: fetchPriorityCounts } = usePriorityCounts(mode);
  // Fix #1466: track summary refetch so category pills can show a loading skeleton.
  const isSummaryLoading = useSelector(selectSummaryLoading);
  const {
    isGated,
    prioritisedCount: gatePrioritisedCount,
    totalCount: gateTotalCount,
    justUngated,
    clearJustUngated,
    dismissGate,
  } = usePrioritisationGate();

  const activeFilterCount =
    (filters.accountIds.length > 0 ? 1 : 0) +
    (filters.categories.length > 0 ? 1 : 0) +
    (filters.minPriority !== null ? 1 : 0);

  // When the prioritisation gate lifts for the first time, auto-switch to VH filter
  // so new users get the focused experience after initial analysis completes.
  useEffect(() => {
    if (justUngated) {
      const hasAlreadySwitched = (() => {
        try {
 return !!localStorage.getItem(GATE_FILTER_SWITCHED_KEY); 
} catch {
 return false; 
}
      })();
      if (!hasAlreadySwitched && filters.minPriority === null && filters.maxPriority === null) {
        setPriorityFilter(VERY_HIGH_PRIORITY_THRESHOLD, null);
        fetchEmails({ minPriority: VERY_HIGH_PRIORITY_THRESHOLD, maxPriority: null });
      }
      clearJustUngated();
    }
  }, [justUngated, clearJustUngated, filters.minPriority, filters.maxPriority, setPriorityFilter, fetchEmails]);

  if (loading) {
    return <InboxLoadingState />;
  }

  if (fetchError === ERROR_CODE_GMAIL_REQUIRED) {
    return <GmailConnectionScreen />;
  }

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
          categoryCounts={categorySummary ? Object.fromEntries(categorySummary.map(cat => [cat.id, cat.count])) : undefined}
          bucketCounts={priorityCounts ? {
            'Very Low': priorityCounts.veryLow,
            'Low': priorityCounts.low,
            'Medium': priorityCounts.medium,
            'High': priorityCounts.high,
            'Very High': priorityCounts.veryHigh,
          } : undefined}
          priorityTotalCount={priorityCounts ? (() => {
            // Fix #1466 (P1): use score-based bucket boundaries from PRIORITY_BUCKET_DEFS
            // instead of hardcoded visual positions (0-20-40-60-80-100). The old code
            // compared score values (e.g. minPriority=50) against visual boundaries,
            // which caused wrong bucket overlap — e.g. "Very High" (score≥50) incorrectly
            // included "Medium" (visual max=60 > score 50).
            const LABEL_TO_KEY: Record<string, keyof typeof priorityCounts> = {
              'Very Low': 'veryLow',
              'Low': 'low',
              'Medium': 'medium',
              'High': 'high',
              'Very High': 'veryHigh',
            };
            const minScore = filters.minPriority;
            const maxScore = filters.maxPriority;
            return PRIORITY_BUCKET_DEFS
              .filter(bucket => bucket.label !== 'All')
              .filter(bucket => {
                const bucketMin = bucket.min ?? -Infinity;
                const bucketMax = bucket.max ?? Infinity;
                const filterMin = minScore ?? -Infinity;
                const filterMax = maxScore ?? Infinity;
                return bucketMin < filterMax && bucketMax > filterMin;
              })
              .reduce((sum, bucket) => {
                const key = LABEL_TO_KEY[bucket.label];
                return sum + (key ? (priorityCounts[key] ?? 0) : 0);
              }, 0);
          })() : undefined}
          isSummaryLoading={isSummaryLoading}
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
        {/* Onboarding gate: shown while initial prioritisation is running */}
        {isGated ? (
          <PrioritisationInterstitial
            prioritisedCount={gatePrioritisedCount}
            totalCount={gateTotalCount}
            onDismiss={dismissGate}
          />
        ) : (
          <>
            {/* "Analysing priority..." virtual category for remaining unprioritised emails */}
            {priorityCounts && priorityCounts.unprioritised > 0 && (
              <div style={{ padding: `${theme.spacing.sm} ${theme.spacing.md} 0` }}>
                <AnalysingPriorityCategory count={priorityCounts.unprioritised} />
              </div>
            )}
            <InboxContent
              mode={mode} emails={emails} loading={loading} hasInitiallyLoaded={hasInitiallyLoaded}
              loadingModeSwitch={loadingModeSwitch} decrypting={decrypting} fetchError={fetchError}
              selectedEmailIndex={selectedEmailIndex} selectedEmailIds={selectedEmailIds}
              triageSuggestions={triageSuggestions} followUpDataMap={followUpDataMap}
              isGeneratingDrafts={isGeneratingDrafts} followUpsError={followUpsError}
              priorityTooltip={priorityTooltip} keyboardHint={keyboardHint} snoozeInput={snoozeInput}
              emailActions={{
                ...emailActions,
                // Refresh priority counts after individual email archive so the progressive
                // unlock prompt shows accurate tier counts. Fix #1456: without this,
                // the stale VH=1 count persists after archiving the last VH email, causing
                // the prompt to show an incorrect "1 email waiting" count.
                handleArchive: async (emailId: string, event: React.MouseEvent) => {
                  await emailActions.handleArchive(emailId, event);
                  fetchPriorityCounts();
                },
              }} modals={modals} splitView={splitView}
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
              onUnlockPriorityTier={(minPriority: number, maxPriority: number | null) => {
                const newFilters = { minPriority, maxPriority };
                setPriorityFilter(minPriority, maxPriority);
                fetchEmails(newFilters);
                fetchPriorityCounts();
              }}
              onDismissUnlockPrompt={() => {
                // Keep current priority tier — do not change minPriority
              }}
              onClearFilters={() => {
                clearFilters();
                fetchEmails();
              }}
              onSplitViewArchive={id => navigateToNextEmailAfterAction(id, emails, splitView, setSelectedEmailIndex)}
              onSplitViewSnooze={id => navigateToNextEmailAfterAction(id, emails, splitView, setSelectedEmailIndex)}
              onSplitViewPrioritySet={(id, count) => {
                const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
                emailActions.handleSetStarCount(id, count, fakeEvent);
                navigateToNextEmailAfterAction(id, emails, splitView, setSelectedEmailIndex);
              }}
            />
          </>
        )}
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
  return (
    <InboxProvider isFocusedMode={false}>
      <InboxView />
    </InboxProvider>
  );
};

export default Inbox;
