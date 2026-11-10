import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { theme } from 'theme/theme';
import { CategoryArchiveSuggestion } from 'utils/categoryArchiveWorkflow';

import { ActionMoveFeedbackLayer } from 'components/inbox/action-move/ActionMoveFeedbackLayer';
import { AnalysingPriorityCategory } from 'components/inbox/AnalysingPriorityCategory';
import { ArchiveConfirmationToast } from 'components/inbox/ArchiveConfirmationToast';
import { AutoArchiveSuggestionsNotice } from 'components/inbox/auto-archive-notice/AutoArchiveSuggestionsNotice';
import { BulkOperationsBar } from 'components/inbox/BulkOperationsBar';
import { DebugPanel } from 'components/inbox/DebugPanel';
import { DistractionFrictionModal } from 'components/inbox/DistractionFrictionModal';
import { GmailConnectionScreen } from 'components/inbox/GmailConnectionScreen';
import { ImportOlderEmailsNotice } from 'components/inbox/ImportOlderEmailsNotice';
import { hasPendingCategorisation, navigateAfterSplitViewAction } from 'components/inbox/inboxCategoryHelpers';
import { InboxContent } from 'components/inbox/InboxContent';
import { InboxFilters } from 'components/inbox/InboxFilters';
import { InboxHeader } from 'components/inbox/InboxHeader';
import { InboxLoadingState } from 'components/inbox/InboxLoadingState';
import { InboxModals } from 'components/inbox/InboxModals';
import { InboxOverlays } from 'components/inbox/InboxOverlays';
import { InboxPlanStatusBanner } from 'components/inbox/InboxPlanStatusBanner';
import { KeyboardHintTooltip } from 'components/inbox/KeyboardHintTooltip';
import { OpenTrackingNoticeBanner } from 'components/inbox/OpenTrackingNoticeBanner';
import { countThreadsInPriorityRange, shouldRefetchEmptyTriageList } from 'components/inbox/priorityRangeCounts';
import { shouldRevealLowerPriorityTriage } from 'components/inbox/revealLowerPriorityTriage';
import { Sidebar } from 'components/inbox/Sidebar';
import { LoadingState, PrioritisationInterstitial } from 'components/inbox/states';
import { SuggestArchiveWorkflowModal } from 'components/inbox/SuggestArchiveWorkflowModal';
import { selectTriageContentRegion, TriageContentRegion } from 'components/inbox/triageContentRegion';
import { API_URL } from 'config/api';
import { ERROR_CODE_GMAIL_REQUIRED, MODE_TRIAGE } from 'constants/strings';
import { useInboxActions, useInboxData, useInboxFiltersCtx, useInboxUI } from 'contexts/InboxContext';
import { InboxProvider } from 'contexts/InboxProvider';
import { useDebugMode } from 'hooks/useDebugMode';
import { useDistractionFriction } from 'hooks/useDistractionFriction';
import { useFirstImportRefresh } from 'hooks/useFirstImportRefresh';
import {
  HIGH_PRIORITY_THRESHOLD,
  isPriorityFilterActiveForMode,
  PRIORITY_FILTER_SOURCE,
  PriorityFilterSource,
  VERY_HIGH_PRIORITY_THRESHOLD,
} from 'hooks/useInboxFilters';
import { GATE_FILTER_SWITCHED_KEY, usePrioritisationGate } from 'hooks/usePrioritisationGate';
import { PriorityCounts, usePriorityCounts } from 'hooks/usePriorityCounts';
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
    workAdditionCount,
    nextDelivery,
    lastUrgentCheck,
    selectedEmailIndex,
    selectedEmailIds,
    actionMoveFeedback,
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
      collapseFilterBar,
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
  const distraction = useDistractionFriction({ mode, tabCounts, workAdditionCount });
  // Conversations already waiting in Action + Follow-Up when this Triage session
  // began (snapshot, NOT live counts), shown in the friction copy. Emails moved to
  // Action/Follow-Up mid-session must not inflate this and re-trigger the gate.
  const existingWorkCount = distraction.existingActionCount + distraction.existingFollowUpCount;
  const requestDistractionUnlock = distraction.requestUnlock;

  const applyPriorityRange = (minPriority: number | null, maxPriority: number | null, source: PriorityFilterSource) => {
    setPriorityFilter(minPriority, maxPriority, source);
    // The new values travel as overrides: the state update above lands after this call.
    fetchEmails({ minPriority, maxPriority, priorityFilterSource: source });
    fetchPriorityCounts();
  };
  // Peek/unlock is a Triage-scoped guided action. Shared by the frictionless peek path and the
  // friction-modal completion path.
  const applyPriorityUnlock = (minPriority: number | null, maxPriority: number | null) =>
    applyPriorityRange(minPriority, maxPriority, PRIORITY_FILTER_SOURCE.GUIDED);

  // Every user path to lower-priority mail (checkboxes, "Show all emails", "Clear all filters")
  // goes through the distraction gate. Before, the checkboxes' slider and Clear-all bypassed it,
  // and the gate's floor effect then silently put the High filter back.
  const handlePriorityCheckboxChange = (minPriority: number | null, maxPriority: number | null) => {
    if (distraction.requestUnlock(minPriority, maxPriority)) {
      return;
    }
    applyPriorityRange(minPriority, maxPriority, PRIORITY_FILTER_SOURCE.MANUAL);
  };
  const handleClearAllFilters = () => {
    if (distraction.requestUnlock(null, null)) {
      return;
    }
    clearFilters();
    // Cleared values travel as overrides: clearFilters() only schedules the state update. Fix #2334.
    fetchEmails({ minPriority: null, maxPriority: null, accountIds: [], categories: [] });
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

  // A guided (auto-applied) priority filter is not actually applied outside Triage, so it must
  // not inflate the active-filter count on Action / Follow-Up. isPriorityFilterActiveForMode
  // returns false for a guided filter in a non-Triage mode.
  const activeFilterCount =
    (filters.accountIds.length > 0 ? 1 : 0) +
    (filters.categories.length > 0 ? 1 : 0) +
    (isPriorityFilterActiveForMode(mode, filters) ? 1 : 0);
  // Keep the filter-button highlight / clear-button visibility in sync with the count above.
  const hasEffectiveActiveFilters = activeFilterCount > 0;

  // Fix #1571 Item 3: extract priorityTotalCount so it can be passed to the debug panel.
  const priorityTotalCount = priorityCounts
    ? countThreadsInPriorityRange(priorityCounts, filters.minPriority, filters.maxPriority)
    : undefined;

  // While the first import is still being scored, keep the counts fresh, and refetch a Triage
  // list that was loaded before any High mail existed once the counts say it has some.
  const isFirstImportRunning = (priorityCounts?.unprioritised ?? 0) > 0;
  useFirstImportRefresh({ isImportRunning: isFirstImportRunning, onRefresh: fetchPriorityCounts });
  const isTriageListEmpty =
    hasInitiallyLoaded &&
    !decrypting &&
    !loadingModeSwitch &&
    categorySummary !== null &&
    categorySummary.every(category => category.count <= 0);
  const lastEmptyListRefetchCountsRef = useRef<PriorityCounts | null>(null);
  useEffect(() => {
    if (!priorityCounts || lastEmptyListRefetchCountsRef.current === priorityCounts) {
      return;
    }
    const shouldRefetch = shouldRefetchEmptyTriageList({
      isTriage: mode === MODE_TRIAGE,
      isListEmpty: isTriageListEmpty,
      threadsInRange: priorityTotalCount ?? 0,
    });
    if (shouldRefetch) {
      lastEmptyListRefetchCountsRef.current = priorityCounts;
      fetchEmails();
    }
  }, [priorityCounts, mode, isTriageListEmpty, priorityTotalCount, fetchEmails]);

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
        setPriorityFilter(HIGH_PRIORITY_THRESHOLD, null, PRIORITY_FILTER_SOURCE.GUIDED);
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
      setPriorityFilter(HIGH_PRIORITY_THRESHOLD, null, PRIORITY_FILTER_SOURCE.GUIDED);
      fetchEmails({ minPriority: HIGH_PRIORITY_THRESHOLD, maxPriority: null });
    } else if (filters.priorityFilterSource !== PRIORITY_FILTER_SOURCE.GUIDED) {
      // Values already sit at the guided High-and-above default but the provenance is stale
      // (e.g. a legacy stored filter loaded as `manual`). Re-tag it as guided — no refetch is
      // needed in Triage (guided is applied here anyway); the tag only governs other modes.
      setPriorityFilter(HIGH_PRIORITY_THRESHOLD, null, PRIORITY_FILTER_SOURCE.GUIDED);
    }
  }, [
    priorityCounts,
    mode,
    filters.minPriority,
    filters.maxPriority,
    filters.priorityFilterSource,
    setPriorityFilter,
    fetchEmails,
  ]);

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
      setPriorityFilter(HIGH_PRIORITY_THRESHOLD, null, PRIORITY_FILTER_SOURCE.GUIDED);
      fetchEmails({ minPriority: HIGH_PRIORITY_THRESHOLD, maxPriority: null });
    }
  }, [distraction.isGateActive, filters.minPriority, setPriorityFilter, fetchEmails]);

  // When there is NO pre-existing Action/Follow-Up work to point the user at, the
  // "well done — go do your other work" prompt has no premise. So once the guided
  // High-and-above Triage list is cleared but lower-priority Triage threads remain,
  // reveal those threads directly instead of gating behind the prompt. Only fires
  // when the existing-work snapshot has resolved to zero. Session-scoped: the latch
  // resets whenever the user leaves Triage.
  const hasRevealedLowerRef = useRef(false);
  useEffect(() => {
    if (mode !== MODE_TRIAGE) {
      hasRevealedLowerRef.current = false;
      return;
    }
    const shouldReveal = shouldRevealLowerPriorityTriage({
      isTriage: mode === MODE_TRIAGE,
      isGateResolved: distraction.isGateResolved,
      hasExistingWork: distraction.hasExistingWork,
      minPriority: filters.minPriority,
      maxPriority: filters.maxPriority,
      priorityCounts,
      alreadyRevealed: hasRevealedLowerRef.current,
    });
    if (shouldReveal) {
      hasRevealedLowerRef.current = true;
      // Registers the reveal as this session's unlock, so existing work that the import delivers
      // afterwards can't switch the gate on and hide these threads again.
      requestDistractionUnlock(null, null);
      setPriorityFilter(null, null);
      fetchEmails({ minPriority: null, maxPriority: null });
      fetchPriorityCounts();
    }
  }, [
    mode,
    distraction.isGateResolved,
    distraction.hasExistingWork,
    requestDistractionUnlock,
    filters.minPriority,
    filters.maxPriority,
    priorityCounts,
    setPriorityFilter,
    fetchEmails,
    fetchPriorityCounts,
  ]);

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
          onPrevTourStep={onboarding.handlePrevTourStep}
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
          gmailAccessIssue={user?.gmailAccessIssue}
        />
        <InboxHeader
          mode={mode}
          setMode={setMode}
          loadingModeSwitch={loadingModeSwitch}
          triageTabRef={triageTabRef}
          actionTabRef={actionTabRef}
          followUpTabRef={followUpTabRef}
          tabCounts={tabCounts}
          actionMoveFeedback={actionMoveFeedback}
          onToggleMobileMenu={openMobileMenu}
          isFilterBarVisible={isFilterBarVisible}
          hasActiveFilters={hasEffectiveActiveFilters}
          activeFilterCount={activeFilterCount}
          onToggleFilterBar={toggleFilterBar}
          onClearFilters={handleClearAllFilters}
          isAdmin={user?.isAdmin}
          debugViewOpen={debugPanel.debugViewOpen}
          onToggleDebug={() => debugPanel.setDebugViewOpen(!debugPanel.debugViewOpen)}
          onViewBlockedEmails={() => setMode('blocked')}
          onViewAutoRespondedEmails={() => setMode('autoresponded')}
        />
        <ActionMoveFeedbackLayer feedback={actionMoveFeedback} />
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
          onPriorityChange={handlePriorityCheckboxChange}
          onCollapse={collapseFilterBar}
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
          isPriorityFilterActive={isPriorityFilterActiveForMode(mode, filters)}
        />
        <InboxPlanStatusBanner />
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
          onBulkSnooze={emailActions.handleBulkSnooze}
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
            {mode === MODE_TRIAGE && (
              <ImportOlderEmailsNotice
                syncWindowLimited={user?.syncWindowLimited}
                isTriageCleared={hasInitiallyLoaded && tabCounts?.triage === 0}
              />
            )}
            {user && (
              <>
                <OpenTrackingNoticeBanner
                  userId={user.id}
                  trackEmailOpens={user.trackEmailOpens}
                  hasSeenTour={user.hasSeenTour}
                />
                <AutoArchiveSuggestionsNotice userId={user.id} hasSeenTour={user.hasSeenTour} />
              </>
            )}
            {/* "Analysing priority..." banner for unprioritised emails, unless the
                "AI deciding category" accordion is already listing them */}
            {priorityCounts && priorityCounts.unprioritised > 0 && !hasPendingCategorisation(categorySummary) && (
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
              onClearFilters={handleClearAllFilters}
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
