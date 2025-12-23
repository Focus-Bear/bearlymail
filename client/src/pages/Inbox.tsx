import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { theme } from '../theme/theme';
import { ConfirmModal } from '../components/ConfirmModal';
import { StarDiscrepancyModal } from '../components/priority/StarDiscrepancyModal';
import { PriorityOverrideModal } from '../components/priority/PriorityOverrideModal';
import { UrgencyOverrideModal } from '../components/inbox/UrgencyOverrideModal';
import { EmailDetailInline } from '../components/EmailDetailInline';
import { DebugPanel } from '../components/inbox/DebugPanel';
import { InboxOverlays } from '../components/inbox/InboxOverlays';
import { InboxHeader } from '../components/inbox/InboxHeader';
import { BulkOperationsBar } from '../components/inbox/BulkOperationsBar';
import { Sidebar } from '../components/inbox/Sidebar';
import { EmailListStates } from '../components/inbox/EmailListStates';
import { ResizableDivider } from '../components/inbox/ResizableDivider';
import { EmailListItem } from '../components/inbox/EmailListItem';
import { GmailConnectionScreen } from '../components/inbox/GmailConnectionScreen';
import { SplitViewPanel } from '../components/inbox/SplitViewPanel';
import { KeyboardHintTooltip } from '../components/inbox/KeyboardHintTooltip';
import { DebugView } from '../components/inbox/DebugView';
import { AppFooter } from '../components/AppFooter';
import { Email, InboxMode } from '../types/email';
import { API_URL } from '../config/api';
import { captureEvent } from '../utils/posthog';
import {
  useEmailManagement,
  useTriageSuggestions,
  useEmailSelection,
  useBatchSchedule,
  useKeyboardShortcuts,
  useOnboarding,
  useDebugPanel,
  useModals,
  useSnoozeInput,
  usePriorityTooltip,
  useKeyboardHint,
  useSplitView,
  useUrgentNotification,
  useEmailActions,
  useFollowUps,
  useEmailProcessingPolling,
  useInboxInitialization,
  useInboxModeChanges,
} from '../hooks';
import { FollowUpActions } from '../components/inbox/FollowUpActions';

const Inbox: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout, refreshUser, loading: authLoading } = useAuth();

  // Mode state (kept here as it's used by multiple hooks)
  const [mode, setMode] = useState<InboxMode>('triage');

  // Triage suggestions hook
  const {
    triageSuggestions,
    loadingSuggestions,
    fetchTriageSuggestions,
    removeSuggestion,
    clearSuggestionsCache,
  } = useTriageSuggestions();

  // Email management hook
  const emailManagement = useEmailManagement({ mode, onSuggestionRemove: removeSuggestion });
  const {
    emails,
    setEmails,
    loading,
    decrypting,
    loadingModeSwitch,
    setLoadingModeSwitch,
    fetchError,
    fetchEmails,
    handleSetStarCount: handleSetStarCountBase,
    handleArchive: handleArchiveBase,
    handleSnooze: handleSnoozeBase,
    handleMarkAsRead,
  } = emailManagement;

  // Batch schedule hook
  const { nextDelivery, fetchBatchStatus } = useBatchSchedule();

  // Email selection hook
  const {
    selectedEmailIndex,
    setSelectedEmailIndex,
    selectedEmailIds,
    setSelectedEmailIds,
    handleEmailClick: handleEmailClickBase,
  } = useEmailSelection(mode, emails.length);

  // Follow-ups hook (only used for draft generation in follow-up mode)
  const {
    threads: followUpThreads,
    error: followUpsError,
    isGeneratingDrafts,
    generateDrafts,
    updateDraft,
    bulkSend,
    fetchThreadsWithDrafts,
  } = useFollowUps();

  // Store follow-up data mapped by threadId
  const [followUpDataMap, setFollowUpDataMap] = useState<Map<string, any>>(new Map());

  // Fetch follow-up data when in follow-up mode
  useEffect(() => {
    if (mode === 'follow-up' && user && !authLoading) {
      fetchThreadsWithDrafts();
    }
  }, [mode, user, authLoading, fetchThreadsWithDrafts, isGeneratingDrafts]);

  // Update follow-up data map when threads change
  useEffect(() => {
    if (mode === 'follow-up' && followUpThreads.length > 0) {
      const map = new Map();
      followUpThreads.forEach((thread: any) => {
        if (thread.followUp) {
          map.set(thread.threadId, thread.followUp);
        }
      });
      setFollowUpDataMap(map);
    }
  }, [mode, followUpThreads]);

  // Hooks for state management
  const snoozeInput = useSnoozeInput();
  const onboarding = useOnboarding({
    user,
    authLoading,
    refreshUser,
  });
  const urgentNotification = useUrgentNotification();
  const debugPanel = useDebugPanel(() => fetchEmails());
  const modals = useModals();
  const priorityTooltip = usePriorityTooltip();
  const keyboardHint = useKeyboardHint();
  const splitView = useSplitView();

  // Initialization hook
  const { hasInitiallyLoaded, hasRunAnalysis } = useInboxInitialization({
    authLoading,
    user,
    fetchEmails,
    fetchBatchStatus,
  });

  // Tour element refs
  const triageTabRef = useRef<HTMLButtonElement>(null);
  const actionTabRef = useRef<HTMLButtonElement>(null);
  const followUpTabRef = useRef<HTMLButtonElement>(null);
  const deliverBtnRef = useRef<HTMLButtonElement>(null);
  
  // Split view container ref
  const splitViewContainerRef = useRef<HTMLDivElement>(null);
  const emailListRef = useRef<HTMLDivElement>(null);
  const emailDetailRef = useRef<HTMLDivElement>(null);
  
  // Mode changes hook
  useInboxModeChanges({
    mode,
    hasInitiallyLoaded,
    user,
    authLoading,
    fetchEmails,
    fetchBatchStatus,
    setEmails,
    setLoadingModeSwitch,
    clearSuggestionsCache,
    fetchTriageSuggestions,
    emails,
    loadingSuggestions,
  });

  const navigate = useNavigate();

  const tourSteps = [
    { title: t('onboarding.tour.welcome'), content: t('onboarding.tour.welcomeContent') },
    { title: t('onboarding.tour.triageTitle'), content: t('onboarding.tour.triageContent') },
    { title: t('onboarding.tour.actionTitle'), content: t('onboarding.tour.actionContent') },
    { title: t('onboarding.tour.deliveryTitle'), content: t('onboarding.tour.deliveryContent') },
  ];

  // Email action handlers
  const emailActions = useEmailActions({
    mode,
    emails,
    setEmails,
    selectedEmailIds,
    setSelectedEmailIds,
    handleSetStarCountBase,
    handleArchiveBase,
    handleSnoozeBase,
    handleMarkAsRead,
    handleBulkMarkAsRead: emailManagement.handleBulkMarkAsRead,
    handleBulkMarkAsUnread: emailManagement.handleBulkMarkAsUnread,
    onShowStarDiscrepancy: modals.showStarDiscrepancy,
    onShowPriorityOverride: modals.showPriorityOverride,
    onShowBlockConfirm: modals.showBlockConfirm,
    onHideBlockConfirm: modals.hideBlockConfirm,
    blockConfirmEmail: modals.blockConfirmEmail,
    fetchEmails,
    snoozeInput,
  });

  // handleMarkAsRead is now provided by useEmailManagement hook

  // Bulk operations are now handled by useEmailActions hook

  // Onboarding is now handled by useOnboarding hook (scan progress polling included)

  // Poll for email updates when emails are actively processing
  useEmailProcessingPolling({
    emails,
    fetchEmails,
  });

  // Track inbox view
  useEffect(() => {
    if (user && !authLoading && hasInitiallyLoaded) {
      captureEvent('inbox_viewed', { mode });
    }
  }, [user, authLoading, hasInitiallyLoaded, mode]);

  // Note: Follow-up emails are now fetched via getInbox with mode='follow-up'
  // The follow-up-specific features (draft generation) are handled separately

  // Use keyboard shortcuts hook
  useKeyboardShortcuts({
    emails,
    selectedEmailIndex,
    selectedEmailIds,
    setSelectedEmailIndex,
    onArchive: handleArchiveBase,
    onSetStarCount: handleSetStarCountBase,
  });

  // Wrapper for email click that passes emails array
  const handleEmailClick = useCallback((emailId: string, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    handleEmailClickBase(emailId, index, e, emails);
  }, [handleEmailClickBase, emails]);

  // Handle email selection - use split view on desktop, navigate on mobile
  const handleEmailSelect = useCallback((emailId: string, e: React.MouseEvent) => {
    captureEvent('email_clicked', { email_id: emailId, mode });
    if (splitView.isMobile) {
      // On mobile, navigate to full email detail page
      handleMarkAsRead(emailId);
      navigate(`/email/${emailId}`);
        } else {
      // On desktop, open in split view
      handleMarkAsRead(emailId);
      splitView.openEmail(emailId);
    }
  }, [splitView, handleMarkAsRead, navigate, mode]);

  // Keyboard navigation for split view
  useEffect(() => {
    if (splitView.isMobile) return; // Skip on mobile

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close detail panel
      if (e.key === 'Escape' && splitView.selectedEmailId) {
        splitView.closeEmail();
        // Focus back on email list
        emailListRef.current?.focus();
      return;
    }

      // Tab navigation between panes
      if (e.key === 'Tab' && !e.shiftKey && document.activeElement) {
        const activeEl = document.activeElement;
        const isInList = emailListRef.current?.contains(activeEl);
        const isInDetail = emailDetailRef.current?.contains(activeEl);

        // If we're in the list and tabbing forward, move to detail if open
        if (isInList && splitView.selectedEmailId && !isInDetail) {
          // Check if we're at the end of focusable elements in list
          const focusableInList = emailListRef.current?.querySelectorAll(
            'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
          );
          if (focusableInList && focusableInList.length > 0) {
            const lastFocusable = focusableInList[focusableInList.length - 1] as HTMLElement;
            if (activeEl === lastFocusable || activeEl === emailListRef.current) {
              e.preventDefault();
              const firstFocusableInDetail = emailDetailRef.current?.querySelector(
                'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
              ) as HTMLElement;
              firstFocusableInDetail?.focus();
            }
          }
        }
      }

      // Shift+Tab navigation
      if (e.key === 'Tab' && e.shiftKey && document.activeElement) {
        const activeEl = document.activeElement;
        const isInList = emailListRef.current?.contains(activeEl);
        const isInDetail = emailDetailRef.current?.contains(activeEl);

        // If we're in detail and shift+tabbing backward, move to list
        if (isInDetail && !isInList) {
          const focusableInDetail = emailDetailRef.current?.querySelectorAll(
            'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
          );
          if (focusableInDetail && focusableInDetail.length > 0) {
            const firstFocusable = focusableInDetail[0] as HTMLElement;
            if (activeEl === firstFocusable) {
              e.preventDefault();
              const lastFocusableInList = emailListRef.current?.querySelector(
                'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
              ) as HTMLElement;
              lastFocusableInList?.focus();
            }
          }
        }
      }

      // Arrow keys to navigate emails when list is focused
      if (emailListRef.current?.contains(document.activeElement)) {
        const visibleEmails = emails.filter(e => !e.isArchived);
        if (e.key === 'ArrowDown' && selectedEmailIndex < visibleEmails.length - 1) {
          e.preventDefault();
          setSelectedEmailIndex(selectedEmailIndex + 1);
        } else if (e.key === 'ArrowUp' && selectedEmailIndex > 0) {
          e.preventDefault();
          setSelectedEmailIndex(selectedEmailIndex - 1);
        } else if (e.key === 'Enter' && selectedEmailIndex >= 0 && visibleEmails[selectedEmailIndex]) {
          e.preventDefault();
          handleEmailSelect(visibleEmails[selectedEmailIndex].id, e as any);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [splitView, selectedEmailIndex, emails, setSelectedEmailIndex, handleEmailSelect]);



  // getPriorityBadge is now imported from utils

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: theme.colors.background.default,
        color: theme.colors.text.secondary,
      }}>
        {t('inbox.loadingInbox')}
      </div>
    );
  }

  // Show Gmail connection screen if required
  if (fetchError === 'GMAIL_REQUIRED') {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: theme.colors.background.default,
        padding: theme.spacing.xl,
      }}>
        <div style={{
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing['2xl'],
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.lg,
          maxWidth: '500px',
          textAlign: 'center',
        }}>
          <h1 style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.lg,
            fontSize: theme.typography.fontSize['2xl'],
            fontWeight: theme.typography.fontWeight.bold,
          }}>
            Connect Your Gmail Account
          </h1>
          <p style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xl,
            fontSize: theme.typography.fontSize.base,
            lineHeight: 1.6,
          }}>
            To use BearlyMail, you need to connect at least one Gmail account. This allows us to sync and manage your emails.
          </p>
          <button
            onClick={() => {
              window.location.href = `${API_URL}/google-accounts/connect`;
            }}
            style={{
              padding: `${theme.spacing.md} ${theme.spacing.xl}`,
              backgroundColor: theme.colors.primary.main,
              color: 'white',
              border: 'none',
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.base,
              fontWeight: theme.typography.fontWeight.semibold,
              cursor: 'pointer',
              marginBottom: theme.spacing.md,
            }}
          >
            Connect Gmail Account
          </button>
          <p style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.tertiary,
            marginTop: theme.spacing.lg,
          }}>
            You can connect multiple Gmail accounts from Settings after connecting your first account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: theme.colors.background.default,
      overflow: 'hidden',
    }}>
      <Sidebar user={user} logout={logout} />

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
          nextDelivery={nextDelivery}
          hasRunAnalysis={hasRunAnalysis}
          triageTabRef={triageTabRef}
          actionTabRef={actionTabRef}
          followUpTabRef={followUpTabRef}
        />



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
            />

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

            {/* Main Content Area - Split View */}
            <div 
              ref={splitViewContainerRef}
              style={{ 
              flex: 1, 
              display: 'flex', 
              overflow: 'hidden',
              }}
            >
              {/* Email List */}
              <div 
                ref={emailListRef}
                tabIndex={0}
                style={{ 
                  flex: splitView.panelExpanded && splitView.selectedEmailId ? 0 : splitView.selectedEmailId ? `0 0 ${splitView.splitPosition}%` : 1,
                overflowY: 'auto', 
                padding: theme.spacing['2xl'],
                  transition: splitView.isResizing ? 'none' : 'flex 0.3s ease',
                  borderRight: splitView.selectedEmailId && !splitView.panelExpanded && !splitView.isMobile ? `1px solid ${theme.colors.border.light}` : 'none',
                }}
              >
                <div style={{ maxWidth: splitView.selectedEmailId ? '100%' : '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
                {mode === 'follow-up' && (
                  <FollowUpActions
                    onGenerateDrafts={async () => {
                      const threadIds = emails.filter(e => !e.isArchived).map(e => e.threadId);
                      await generateDrafts(threadIds);
                      // fetchThreadsWithDrafts will update the threads, which will trigger the useEffect
                    }}
                    isGenerating={isGeneratingDrafts}
                    error={followUpsError}
                    onRetry={() => fetchEmails()}
                  />
                )}
                <EmailListStates
                  loading={loading}
                  hasInitiallyLoaded={hasInitiallyLoaded}
                  loadingModeSwitch={loadingModeSwitch}
                  decrypting={decrypting}
                  fetchError={fetchError}
                  emailsEmpty={emails.length === 0 && !loading && !loadingModeSwitch}
                  mode={mode}
                  onRetry={() => fetchEmails()}
                />
                {!loading && hasInitiallyLoaded && !loadingModeSwitch && !fetchError && emails.length > 0 && (
              emails.filter(email => !email.isArchived).map((email, index) => {
                    const suggestion = mode === 'triage' ? (triageSuggestions.get(email.id) || null) : null;
                const isSelected = selectedEmailIds.has(email.id) || selectedEmailIndex === index;
                    const followUpData = mode === 'follow-up' ? followUpDataMap.get(email.threadId) : null;
                return (
                      <EmailListItem
                        key={email.id}
                        email={email}
                        index={index}
                        mode={mode}
                        isSelected={isSelected}
                        suggestion={suggestion}
                        priorityTooltip={priorityTooltip}
                        keyboardHint={keyboardHint}
                        snoozeInput={snoozeInput}
                        onEmailClick={handleEmailClick}
                        onEmailSelect={handleEmailSelect}
                        onSetStarCount={emailActions.handleSetStarCount}
                        onArchive={emailActions.handleArchive}
                        onBlockSender={emailActions.handleBlockSender}
                        onSnooze={emailActions.handleSnooze}
                        onOverrideUrgency={() => {
                          if (email.emailThreadId && email.urgencyScore !== undefined) {
                            modals.showUrgencyOverride(email.emailThreadId, email.urgencyScore);
                          }
                        }}
                        followUpData={followUpData}
                        onUpdateDraft={updateDraft}
                        onSendFollowUp={async (followUpId: string) => {
                          await bulkSend([followUpId]);
                          // fetchThreadsWithDrafts will update the threads, which will trigger the useEffect
                          fetchThreadsWithDrafts();
                        }}
                      />
                    );
                  })
                )}
            <DebugView emails={emails} />
                      </div>
                    </div>

              {/* Resizable Divider - Only show on desktop when email is selected */}
              {!splitView.isMobile && splitView.selectedEmailId && !splitView.panelExpanded && (
                <ResizableDivider
                  onResize={splitView.setSplitPosition}
                  onResizeStart={splitView.startResize}
                  onResizeEnd={splitView.endResize}
                  position={splitView.splitPosition}
                  containerRef={splitViewContainerRef}
                />
              )}

              {/* Email Detail Panel - Split View */}
              {!splitView.isMobile && splitView.selectedEmailId && (
                <SplitViewPanel
                  selectedEmailId={splitView.selectedEmailId}
                  panelExpanded={splitView.panelExpanded}
                  splitPosition={splitView.splitPosition}
                  isResizing={splitView.isResizing}
                  emailDetailRef={emailDetailRef}
                  onTogglePanel={splitView.togglePanel}
                  onClose={splitView.closeEmail}
                />
              )}
            </div>
        
        <AppFooter />
      </div>

      {/* Block Sender Confirmation Modal */}
      <ConfirmModal
        isOpen={!!modals.blockConfirmEmail}
        icon="🚫"
        title="Block Sender"
        message={`Block all future emails from ${modals.blockConfirmEmail?.fromName || modals.blockConfirmEmail?.from || 'this sender'}? This email and any future emails from them will be automatically archived.`}
        confirmLabel="Block Sender"
        cancelLabel="Cancel"
        onConfirm={emailActions.confirmBlockSender}
        onCancel={() => modals.hideBlockConfirm()}
      />

      {/* Star Discrepancy Modal */}
      {modals.starDiscrepancyModal?.show && (
        <StarDiscrepancyModal
          emailId={modals.starDiscrepancyModal.emailId}
          userStarCount={modals.starDiscrepancyModal.userStarCount}
          predictedStarCount={modals.starDiscrepancyModal.predictedStarCount}
          onClose={() => modals.hideStarDiscrepancy()}
          onSubmitted={() => {
            modals.hideStarDiscrepancy();
            fetchEmails();
          }}
        />
      )}

      {/* Priority Override Modal */}
      {modals.priorityOverrideModal?.show && (
        <PriorityOverrideModal
          emailId={modals.priorityOverrideModal.emailId}
          originalPriorityScore={modals.priorityOverrideModal.originalPriorityScore}
          newPriorityScore={modals.priorityOverrideModal.newPriorityScore}
          onClose={() => modals.hidePriorityOverride()}
          onSubmitted={() => {
            modals.hidePriorityOverride();
            fetchEmails();
          }}
        />
      )}

      {/* Urgency Override Modal */}
      {modals.urgencyOverrideModal?.show && (
        <UrgencyOverrideModal
          threadId={modals.urgencyOverrideModal.threadId}
          currentUrgencyScore={modals.urgencyOverrideModal.currentUrgencyScore}
          onClose={() => modals.hideUrgencyOverride()}
          onSubmitted={() => {
            modals.hideUrgencyOverride();
            fetchEmails();
          }}
        />
      )}
    </div>
  );
};

export default Inbox;
