import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';
import { CategoryArchiveSuggestion } from 'utils/categoryArchiveWorkflow';

import { AnalysingPriorityCategory } from 'components/inbox/AnalysingPriorityCategory';
import { ArchiveConfirmationToast } from 'components/inbox/ArchiveConfirmationToast';
import { BulkOperationsBar } from 'components/inbox/BulkOperationsBar';
import { DebugPanel } from 'components/inbox/DebugPanel';
import { DistractionFrictionModal } from 'components/inbox/DistractionFrictionModal';
import { GmailConnectionScreen } from 'components/inbox/GmailConnectionScreen';
import { navigateAfterSplitViewAction } from 'components/inbox/inboxCategoryHelpers';
import { InboxContent } from 'components/inbox/InboxContent';
import { InboxFilters } from 'components/inbox/InboxFilters';
import { InboxHeader } from 'components/inbox/InboxHeader';
import { InboxLoadingState } from 'components/inbox/InboxLoadingState';
import { InboxModals } from 'components/inbox/InboxModals';
import { InboxOverlays } from 'components/inbox/InboxOverlays';
import { KeyboardHintTooltip } from 'components/inbox/KeyboardHintTooltip';
import { Sidebar } from 'components/inbox/Sidebar';
import { PrioritisationInterstitial } from 'components/inbox/states';
import { SuggestArchiveWorkflowModal } from 'components/inbox/SuggestArchiveWorkflowModal';
import { SyncWindowBanner } from 'components/inbox/SyncWindowBanner';
import { TriageEntryGate } from 'components/inbox/TriageEntryGate';
import { API_URL } from 'config/api';
import { BUCKET_LABEL_ALL, PRIORITY_BUCKET_DEFS, PRIORITY_LABEL_TO_KEY } from 'constants/priorityBuckets';
import { ERROR_CODE_GMAIL_REQUIRED, MODE_TRIAGE, ROUTE_SEARCH } from 'constants/strings';
import { useInboxActions, useInboxData, useInboxFiltersCtx, useInboxUI } from 'contexts/InboxContext';
import { InboxProvider } from 'contexts/InboxProvider';
import { useDebugMode } from 'hooks/useDebugMode';
import { useDistractionFriction } from 'hooks/useDistractionFriction';
import { HIGH_PRIORITY_THRESHOLD, MEDIUM_PRIORITY_THRESHOLD, VERY_HIGH_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';
import { GATE_FILTER_SWITCHED_KEY, usePrioritisationGate } from 'hooks/usePrioritisationGate';
import { usePriorityCounts } from 'hooks/usePriorityCounts';
import { useSidebarState } from 'hooks/useSidebarState';
import { selectSummaryLoading } from 'store/selectors/emailSelectors';


const InboxView: React.FC = () => {
  const [archiveSuggestion, setArchiveSuggestion] = useState<CategoryArchiveSuggestion | null>(null);
  const {
    emails,
    loading,
    decrypting,
    loadingModeSwitch,
    fetchError,
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

  const {
    isCollapsed: isSidebarCollapsed,
    canToggleCollapse: canToggleSidebarCollapse,
    isMobileMenuOpen,
    toggleCollapse: handleToggleSidebarCollapse,
    openMobileMenu,
    closeMobileMenu: handleCloseMobileMenu,
  } = useSidebarState({ splitViewActive: !!splitView.selectedEmailId });

  const navigate = useNavigate();
  const { isDebugModeEnabled } = useDebugMode();
  // Pass current inbox mode so bucket counts match the tab total (fix #1452 bug 3).
  const { counts: priorityCounts, fetchCounts: fetchPriorityCounts } = usePriorityCounts(mode);
  // "Distraction tax": when the user has unfinished work, gate lower-priority
  // Triage emails behind a deliberate unlock exercise (session-scoped).
  const distraction = useDistractionFriction({ mode, tabCounts });

  // Apply a progressive-tier unlock: move the priority floor down and refetch.
  // Shared by the normal unlock path and the friction-modal completion path.
  const applyPriorityUnlock = (minPriority: number, maxPriority: number | null) => {
    setPriorityFilter(minPriority, maxPriority);
    fetchEmails({ minPriority, maxPriority });
    fetchPriorityCounts();
  };
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

  // Fix #1571 Item 3: extract priorityTotalCount so it can be passed to the debug panel.
  // PRIORITY_LABEL_TO_KEY is now imported from constants/priorityBuckets (single source of truth).
  const priorityTotalCount = priorityCounts
    ? PRIORITY_BUCKET_DEFS.filter(bucket => bucket.label !== BUCKET_LABEL_ALL)
        .filter(bucket => {
          const bucketMin = bucket.min ?? -Infinity;
          const bucketMax = bucket.max ?? Infinity;
          const filterMin = filters.minPriority ?? -Infinity;
          const filterMax = filters.maxPriority ?? Infinity;
          return bucketMin < filterMax && bucketMax > filterMin;
        })
        .reduce((sum, bucket) => {
          const key = PRIORITY_LABEL_TO_KEY[bucket.label];
          return sum + (key ? (priorityCounts[key] ?? 0) : 0);
        }, 0)
    : undefined;

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

 
  const hasAutoAdvancedTierRef = useRef(false);
  useEffect(() => {
    if (mode !== MODE_TRIAGE || !priorityCounts || hasAutoAdvancedTierRef.current) {
      return;
    }

    const min = filters.minPriority;
    const max = filters.maxPriority;
    const isDefaultOrUnfiltered =
      (min === VERY_HIGH_PRIORITY_THRESHOLD && max === null) || (min === null && max === null);
    if (!isDefaultOrUnfiltered) {
      // User has a manual filter — respect it and don't auto-advance again.
      hasAutoAdvancedTierRef.current = true;
      return;
    }

    // Only mark auto-advance as done once we've actually acted on real counts.
    // Bailing here while counts are still all-zero (pre-sync) lets the effect
    // retry when the true counts arrive, instead of latching "done" prematurely.
    if (priorityCounts.veryHigh > 0) {
      hasAutoAdvancedTierRef.current = true;
      if (min !== VERY_HIGH_PRIORITY_THRESHOLD) {
        setPriorityFilter(VERY_HIGH_PRIORITY_THRESHOLD, null);
        fetchEmails({ minPriority: VERY_HIGH_PRIORITY_THRESHOLD, maxPriority: null });
      }
    } else if (priorityCounts.high > 0) {
      hasAutoAdvancedTierRef.current = true;
      setPriorityFilter(HIGH_PRIORITY_THRESHOLD, null);
      fetchEmails({ minPriority: HIGH_PRIORITY_THRESHOLD, maxPriority: null });
    } else if (priorityCounts.medium > 0 && !distraction.isGateActive) {
      hasAutoAdvancedTierRef.current = true;
      setPriorityFilter(MEDIUM_PRIORITY_THRESHOLD, null);
      fetchEmails({ minPriority: MEDIUM_PRIORITY_THRESHOLD, maxPriority: null });
    } else if (priorityCounts.medium > 0 && distraction.isGateActive) {
      // Gated: hold the floor at High even though no High emails exist, so the
      // friction unlock is required before medium emails become visible.
      hasAutoAdvancedTierRef.current = true;
      setPriorityFilter(HIGH_PRIORITY_THRESHOLD, null);
      fetchEmails({ minPriority: HIGH_PRIORITY_THRESHOLD, maxPriority: null });
    }
  }, [priorityCounts, mode, filters.minPriority, filters.maxPriority, setPriorityFilter, fetchEmails, distraction.isGateActive]);

  // Enforce the distraction-tax floor for returning users whose stored filter is
  // already below High (Medium/Low/All): while gated, raise it to High so lower
  // tiers stay hidden until the unlock exercise is completed. Idempotent — once
  // the floor sits at High this no longer fires; unlocking disables the gate.
  useEffect(() => {
    if (!distraction.isGateActive) {
      return;
    }
    const min = filters.minPriority;
    if (min === null || min < HIGH_PRIORITY_THRESHOLD) {
      setPriorityFilter(HIGH_PRIORITY_THRESHOLD, null);
      fetchEmails({ minPriority: HIGH_PRIORITY_THRESHOLD, maxPriority: null });
    }
  }, [distraction.isGateActive, filters.minPriority, setPriorityFilter, fetchEmails]);

  if (loading) {
    return <InboxLoadingState />;
  }

  if (fetchError === ERROR_CODE_GMAIL_REQUIRED) {
    return <GmailConnectionScreen />;
  }

  return (
    <div
      className="h-dvh"
      style={{ display: 'flex', backgroundColor: theme.colors.background.default, overflow: 'hidden' }}
    >
      <Sidebar
        user={user}
        logout={logout}
        isCollapsed={isSidebarCollapsed}
        canToggleCollapse={canToggleSidebarCollapse}
        onToggleCollapse={handleToggleSidebarCollapse}
        isMobileMenuOpen={isMobileMenuOpen}
        onCloseMobileMenu={handleCloseMobileMenu}
      />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          minWidth: 0,
        }}
      >
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
          triageTabRef={triageTabRef}
          actionTabRef={actionTabRef}
          followUpTabRef={followUpTabRef}
          tabCounts={tabCounts}
          actionTabPulsing={actionTabPulsing}
          onActionTabPulseEnd={() => setActionTabPulsing(false)}
          onToggleMobileMenu={openMobileMenu}
          isFilterBarVisible={isFilterBarVisible}
          hasActiveFilters={hasActiveFilters}
          activeFilterCount={activeFilterCount}
          onToggleFilterBar={toggleFilterBar}
          onClearFilters={() => {
            clearFilters();
            // Pass cleared filter values explicitly to avoid stale closure sending old filter params.
            // clearFilters() schedules a React state update (async), so fetchEmails() without
            // overrides would capture the pre-clear values and fetch the wrong emails. Fix #2334.
            fetchEmails({ minPriority: null, maxPriority: null, accountIds: [], categories: [] });
          }}
          isAdmin={user?.isAdmin}
          debugViewOpen={debugPanel.debugViewOpen}
          onToggleDebug={() => debugPanel.setDebugViewOpen(!debugPanel.debugViewOpen)}
          onViewBlockedEmails={() => setMode('blocked')}
          onViewAutoRespondedEmails={() => setMode('autoresponded')}
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
          categoryCounts={
            categorySummary ? Object.fromEntries(categorySummary.map(cat => [cat.id, cat.count])) : undefined
          }
          bucketCounts={
            priorityCounts
              ? {
                  'Very Low': priorityCounts.veryLow,
                  Low: priorityCounts.low,
                  Medium: priorityCounts.medium,
                  High: priorityCounts.high,
                  'Very High': priorityCounts.veryHigh,
                }
              : undefined
          }
          priorityTotalCount={priorityTotalCount}
          isSummaryLoading={isSummaryLoading}
        />
        {(user?.isAdmin || isDebugModeEnabled) && debugPanel.debugViewOpen && (
          <DebugPanel
            mode={mode}
            emails={emails}
            allEmails={debugPanel.allEmails}
            loadingAllEmails={debugPanel.loadingAllEmails}
            isOpen={!debugPanel.mainPanelCollapsed}
            onToggle={() => debugPanel.setMainPanelCollapsed(!debugPanel.mainPanelCollapsed)}
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
            filters={filters}
            priorityTotalCount={priorityTotalCount}
          />
        )}
        <BulkOperationsBar
          selectedCount={selectedEmailIds.size}
          onBulkArchive={emailActions.handleBulkArchive}
          onClearSelection={() => setSelectedEmailIds(new Set())}
        />
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
            {user && <SyncWindowBanner userId={user.id} syncWindowLimited={user.syncWindowLimited} />}
            {/* "Analysing priority..." virtual category for remaining unprioritised emails */}
            {priorityCounts && priorityCounts.unprioritised > 0 && (
              <div style={{ padding: `${theme.spacing.sm} ${theme.spacing.md} 0` }}>
                <AnalysingPriorityCategory count={priorityCounts.unprioritised} />
              </div>
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
              }}
              modals={modals}
              splitView={splitView}
              nextDelivery={nextDelivery}
              lastUrgentCheck={lastUrgentCheck}
              onEmailClick={handleEmailClick}
              onEmailSelect={handleEmailSelect}
              onGenerateDrafts={async () => {
                const threadIds = emails.filter(email => !email.isArchived).map(email => email.threadId);
                await generateDrafts(threadIds);
              }}
              onRetry={fetchEmails}
              updateDraft={updateDraft}
              bulkSend={bulkSend}
              fetchThreadsWithDrafts={fetchThreadsWithDrafts}
              emailListRef={emailListRef}
              emailDetailRef={emailDetailRef}
              onBulkArchive={async (emailIds: string[]) => {
                const suggestion = await emailActions.handleCategoryArchiveAll(emailIds);
                fetchPriorityCounts();
                if (suggestion) {
                  setArchiveSuggestion(suggestion);
                }
              }}
              expandedCategories={expandedCategories}
              stableCategoryOrder={stableCategoryOrder}
              onToggleCategory={toggleCategory}
              onUpdateStableCategoryOrder={updateStableCategoryOrder}
              categorySummary={categorySummary}
              loadedCategoryNames={loadedCategoryNames}
              loadingCategoryNames={loadingCategoryNames}
              fetchCategoryEmails={fetchCategoryEmails}
              minPriority={filters.minPriority}
              maxPriority={filters.maxPriority}
              priorityCounts={priorityCounts}
              onUnlockPriorityTier={(minPriority: number, maxPriority: number | null) => {
                // Gated peek below High → open the friction modal instead of unlocking.
                if (distraction.requestUnlock(minPriority, maxPriority)) {
                  return;
                }
                applyPriorityUnlock(minPriority, maxPriority);
              }}
              onDismissUnlockPrompt={() => {
                // Keep current priority tier — do not change minPriority
              }}
              onClearFilters={() => {
                clearFilters();
                // Pass cleared filter values explicitly to avoid stale closure. Fix #2334.
                fetchEmails({ minPriority: null, maxPriority: null, accountIds: [], categories: [] });
              }}
              onSplitViewArchive={id => navigateAfterSplitViewAction(id, emails, mode, splitView, setSelectedEmailIndex, expandedCategories)}
              onSplitViewSnooze={id => navigateAfterSplitViewAction(id, emails, mode, splitView, setSelectedEmailIndex, expandedCategories)}
              onSplitViewPrioritySet={(id, count) => {
                const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
                emailActions.handleSetStarCount(id, count, fakeEvent);
                navigateAfterSplitViewAction(id, emails, mode, splitView, setSelectedEmailIndex, expandedCategories);
              }}
            />
          </>
        )}
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
      {archiveSuggestion && (
        <SuggestArchiveWorkflowModal
          suggestion={archiveSuggestion}
          onClose={() => setArchiveSuggestion(null)}
        />
      )}
      {distraction.isPreScreenOpen && (
        <TriageEntryGate
          existingWorkCount={(tabCounts?.action ?? 0) + (tabCounts?.followUp ?? 0)}
          onSearch={() => navigate(ROUTE_SEARCH)}
          onProceed={distraction.proceedFromPreScreen}
        />
      )}
      {distraction.isModalOpen && (
        <DistractionFrictionModal
          existingWorkCount={(tabCounts?.action ?? 0) + (tabCounts?.followUp ?? 0)}
          onUnlock={() => {
            const target = distraction.completeUnlock();
            if (target) {
              applyPriorityUnlock(target.minPriority, target.maxPriority);
            } else {
              // Pre-screen path: no deferred tier, so reveal the whole inbox.
              clearFilters();
              fetchEmails({ minPriority: null, maxPriority: null, accountIds: [], categories: [] });
              fetchPriorityCounts();
            }
          }}
          onDismiss={distraction.dismissModal}
        />
      )}
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
