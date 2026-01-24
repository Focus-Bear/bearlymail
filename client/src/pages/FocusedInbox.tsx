import React from 'react';

import { ERROR_CODE_GMAIL_REQUIRED } from 'constants/strings';
import { theme } from 'theme/theme';
import { InboxLoadingState } from 'components/inbox/InboxLoadingState';
import { GmailConnectionScreen } from 'components/inbox/GmailConnectionScreen';
import { InboxContent } from 'components/inbox/InboxContent';
import { InboxModals } from 'components/inbox/InboxModals';
import { useInboxState } from 'hooks/useInboxState';

const FocusedInbox: React.FC = () => {
  const {
    mode,
    loading,
    fetchError,
    fetchEmails,
    selectedEmailIndex,
    setSelectedEmailIndex,
    selectedEmailIds,
    triageSuggestions,
    followUpDataMap,
    isGeneratingDrafts,
    followUpsError,
    generateDrafts,
    updateDraft,
    bulkSend,
    fetchThreadsWithDrafts,
    snoozeInput,
    modals,
    priorityTooltip,
    keyboardHint,
    splitView,
    emailActions,
    hasInitiallyLoaded,
    loadingModeSwitch,
    decrypting,
    nextDelivery,
    lastUrgentCheck,
    emailListRef,
    emailDetailRef,
    handleEmailClick,
    handleEmailSelect,
    emails,
  } = useInboxState({ isFocusedMode: true });

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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
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
            const visibleEmails = emails.filter(e => !e.isArchived && e.id !== archivedEmailId);
            
            if (visibleEmails.length === 0) {
              splitView.closeEmail();
              return;
            }
            
            const currentIndex = selectedEmailIndex >= 0 ? selectedEmailIndex : 0;
            const nextIndex = currentIndex < visibleEmails.length 
              ? currentIndex 
              : Math.max(0, visibleEmails.length - 1);
            
            const nextEmail = visibleEmails[nextIndex];
            if (nextEmail) {
              splitView.openEmail(nextEmail.id);
              setSelectedEmailIndex(nextIndex);
            } else {
              splitView.closeEmail();
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

export default FocusedInbox;
