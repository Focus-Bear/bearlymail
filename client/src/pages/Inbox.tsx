import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
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
import { LoadingState, PrioritisationInterstitial } from 'components/inbox/states';
import { SuggestArchiveWorkflowModal } from 'components/inbox/SuggestArchiveWorkflowModal';
import { SyncWindowBanner } from 'components/inbox/SyncWindowBanner';
import { selectTriageContentRegion, TriageContentRegion } from 'components/inbox/triageContentRegion';
import { API_URL } from 'config/api';
import { BUCKET_LABEL_ALL, PRIORITY_BUCKET_DEFS, PRIORITY_LABEL_TO_KEY } from 'constants/priorityBuckets';
import { ERROR_CODE_GMAIL_REQUIRED, MODE_TRIAGE } from 'constants/strings';
import { useInboxActions, useInboxData, useInboxFiltersCtx, useInboxUI } from 'contexts/InboxContext';
import { InboxProvider } from 'contexts/InboxProvider';
import { useDebugMode } from 'hooks/useDebugMode';
import { useDistractionFriction } from 'hooks/useDistractionFriction';
import { HIGH_PRIORITY_THRESHOLD, VERY_HIGH_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';
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

  const { isDebugModeEnabled } = useDebugMode();
  // Pass current inbox mode so bucket counts match the tab total (fix #1452 bug 3).
  const { counts: priorityCounts, fetchCounts: fetchPriorityCounts } = usePriorityCounts(mode);
  // "Distraction tax": when the user has unfinished work, gate lower-priority
  // Triage emails behind a deliberate unlock exercise (session-scoped).
  const distraction = useDistractionFriction({ mode, tabCounts });
  // Conversations already waiting in Action + Follow-Up when this Triage session
  // began (snapshot, NOT live counts), shown in the friction copy. Emails moved to
  // Action/Follow-Up mid-session must not inflate this and re-trigger the gate.
  const existingWorkCount = distraction.existingActionCount + distraction.existingFollowUpCount;

  // Apply a priority-filter change (peek below High) and refetch. Shared by the
  // frictionless peek path and the friction-modal completion path.
  const applyPriorityUnlock = (minPriority: number | null, maxPriority: number | null) => {
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

  // When the prioritisation gate lifts for the first time, auto-switch to the
  // guided High-and-above filter so new users get the focused experience after
  // initial analysis completes.
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
        setPriorityFilter(HIGH_PRIORITY_THRESHOLD, null);
        fetchEmails({ minPriority: HIGH_PRIORITY_THRESHOLD, maxPriority: null });
      }
      clearJustUngated();
    }
  }, [justUngated, clearJustUngated, filters.minPriority, filters.maxPriority, setPriorityFilter, fetchEmails]);

 
  // Guided default: on entering Triage without a manual filter, show High-and-above
  // (High + Very High together). No progressive stepping — the user simply sees
  // their high-priority emails; peeking lower is an explicit, gated opt-in.
  const hasAutoAdvancedTierRef = useRef(false);
  useEffect(() => {
    if (mode !== MODE_TRIAGE || !priorityCounts || hasAutoAdvancedTierRef.current) {
      return;
    }

    const min = filters.minPriority;
    const max = filters.maxPriority;
    // Treat the old Very-High default, the new High default, and "All" as guided
    // defaults to normalise; any other (bounded) filter is a manual choice we keep.
    const isGuidedDefault =
      (min === VERY_HIGH_PRIORITY_THRESHOLD && max === null) ||
      (min === HIGH_PRIORITY_THRESHOLD && max === null) ||
      (min === null && max === null);
    if (!isGuidedDefault) {
      // User has a manual filter — respect it and don't normalise again.
      hasAutoAdvancedTierRef.current = true;
      return;
    }

    // Wait for real counts before latching: bailing while every tier is still zero
    // (pre-sync) lets the effect retry once the true counts arrive.
    const hasAnyPrioritised =
      priorityCounts.veryHigh > 0 ||
      priorityCounts.high > 0 ||
      priorityCounts.medium > 0 ||
      priorityCounts.low > 0 ||
      priorityCounts.veryLow > 0;
    if (!hasAnyPrioritised) {
      return;
    }

    hasAutoAdvancedTierRef.current = true;
    if (min !== HIGH_PRIORITY_THRESHOLD || max !== null) {
      setPriorityFilter(HIGH_PRIORITY_THRESHOLD, null);
      fetchEmails({ minPriority: HIGH_PRIORITY_THRESHOLD, maxPriority: null });
    }
  }, [priorityCounts, mode, filters.minPriority, filters.maxPriority, setPriorityFilter, fetchEmails]);

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

  // Single source of precedence for the Triage content region. The friction modal
  // (and the "pending" holding state while the existing-work snapshot is captured)
  // wins over the normal content, so they can never overlap or flip-flop. See
  // triageContentRegion.ts.
  const triageContentRegion = selectTriageContentRegion({
    isOnboardingGated: isGated,
    isFrictionModalOpen: distraction.isModalOpen,
    isGatePending: !distraction.isGateResolved,
  });

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
        {triageContentRegion === TriageContentRegion.OnboardingInterstitial ? (
          <PrioritisationInterstitial
            prioritisedCount={gatePrioritisedCount}
            totalCount={gateTotalCount}
            onDismiss={dismissGate}
          />
        ) : triageContentRegion === TriageContentRegion.FrictionModal ? (
          // Distraction-tax unlock exercise (reached via the peek CTA), rendered
          // inline in place of the list so the tabs/filters above stay switchable.
          <DistractionFrictionModal
            existingWorkCount={existingWorkCount}
            onUnlock={() => {
              const target = distraction.completeUnlock();
              // The peek always defers a target (min=null, max=High floor); fall
              // back to the whole inbox only if somehow none was captured.
              if (target) {
                applyPriorityUnlock(target.minPriority, target.maxPriority);
              } else {
                clearFilters();
                fetchEmails({ minPriority: null, maxPriority: null, accountIds: [], categories: [] });
                fetchPriorityCounts();
              }
            }}
            onDismiss={distraction.dismissModal}
          />
        ) : triageContentRegion === TriageContentRegion.GatePending ? (
          // Existing-work snapshot still being captured in Triage: hold on a loading
          // state rather than flashing the post-clear prompt with stale/zero counts.
          <LoadingState decrypting={decrypting} loadingModeSwitch={loadingModeSwitch} mode={mode} />
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
              existingActionCount={distraction.existingActionCount}
              existingFollowUpCount={distraction.existingFollowUpCount}
              onTakeAction={() => setMode('action')}
              onUnlockPriorityTier={(minPriority: number | null, maxPriority: number | null) => {
                // Gated peek below High → open the friction modal instead of unlocking.
                if (distraction.requestUnlock(minPriority, maxPriority)) {
                  return;
                }
                applyPriorityUnlock(minPriority, maxPriority);
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
