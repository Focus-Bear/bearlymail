import React from 'react';

// ULTRA-VISIBLE: This confirms the Inbox.tsx module is loaded with the updated code
console.log('%c[INBOX MODULE] Inbox.tsx module loaded!', 'background: magenta; color: white; font-size: 24px;');

import { ERROR_CODE_GMAIL_REQUIRED } from 'constants/strings';
import axios from 'axios';
import { theme } from 'theme/theme';
import { DebugPanel } from 'components/inbox/DebugPanel';
import { InboxOverlays } from 'components/inbox/InboxOverlays';
import { InboxHeader } from 'components/inbox/InboxHeader';
import { BulkOperationsBar } from 'components/inbox/BulkOperationsBar';
import { Sidebar } from 'components/inbox/Sidebar';
import { KeyboardHintTooltip } from 'components/inbox/KeyboardHintTooltip';
import { AppFooter } from 'components/AppFooter';
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
  } = useInboxState();

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
      <Sidebar user={user} logout={logout} isCollapsed={!!splitView.selectedEmailId} />

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
          onSplitViewArchive={(archivedEmailId) => {
            console.log('%c[SPLIT VIEW ARCHIVE] onSplitViewArchive callback triggered!', 'background: cyan; color: black; font-size: 20px;');
            console.log('[SplitViewArchive] Archived email ID:', archivedEmailId);
            console.log('[SplitViewArchive] Current selectedEmailIndex:', selectedEmailIndex);
            
            // IMPORTANT: Filter out BOTH archived emails AND the just-archived email by ID
            // The Redux state update may not have propagated yet (stale closure issue)
            const visibleEmails = emails.filter(e => !e.isArchived && e.id !== archivedEmailId);
            console.log('[SplitViewArchive] Visible emails (excluding archived):', visibleEmails.length);
            console.log('[SplitViewArchive] First 5 visible emails:', visibleEmails.slice(0, 5).map(e => ({ id: e.id, subject: e.subject?.substring(0, 50) })));
            
            if (visibleEmails.length === 0) {
              console.log('[SplitViewArchive] No visible emails, closing split view');
              splitView.closeEmail();
              return;
            }
            
            // Use the current index as the next index (since we removed the current email)
            // If we were at the last email, go to the new last one
            const currentIndex = selectedEmailIndex >= 0 ? selectedEmailIndex : 0;
            const nextIndex = currentIndex < visibleEmails.length 
              ? currentIndex 
              : Math.max(0, visibleEmails.length - 1);
            
            const nextEmail = visibleEmails[nextIndex];
            console.log('[SplitViewArchive] Next email to open:', nextEmail ? { id: nextEmail.id, subject: nextEmail.subject?.substring(0, 50) } : 'NOT FOUND');
            
            if (nextEmail) {
              splitView.openEmail(nextEmail.id);
              setSelectedEmailIndex(nextIndex);
              console.log('[SplitViewArchive] Opened next email successfully');
            } else {
              console.log('[SplitViewArchive] No next email found, closing split view');
              splitView.closeEmail();
            }
          }}
        />

        <AppFooter />
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
