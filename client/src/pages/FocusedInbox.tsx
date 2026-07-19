import React from 'react';
import { theme } from 'theme/theme';

import { ArchiveConfirmationToast } from 'components/inbox/ArchiveConfirmationToast';
import { GmailConnectionScreen } from 'components/inbox/GmailConnectionScreen';
import { navigateAfterSplitViewAction } from 'components/inbox/inboxCategoryHelpers';
import { InboxContent } from 'components/inbox/InboxContent';
import { InboxLoadingState } from 'components/inbox/InboxLoadingState';
import { InboxModals } from 'components/inbox/InboxModals';
import { ERROR_CODE_GMAIL_REQUIRED } from 'constants/strings';
import { useInboxActions, useInboxData, useInboxFiltersCtx, useInboxUI } from 'contexts/InboxContext';
import { InboxProvider } from 'contexts/InboxProvider';

const FocusedInboxView: React.FC = () => {
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
    nextDelivery,
    lastUrgentCheck,
    selectedEmailIndex,
    selectedEmailIds,
    expandedCategories,
    stableCategoryOrder,
  } = useInboxData();

  const {
    splitView,
    modals,
    snoozeInput,
    priorityTooltip,
    keyboardHint,
    keyboardShortcuts,
    emailListRef,
    emailDetailRef,
  } = useInboxUI();

  const {
    emailActions,
    fetchEmails,
    handleEmailClick,
    handleEmailSelect,
    generateDrafts,
    updateDraft,
    bulkSend,
    fetchThreadsWithDrafts,
    toggleCategory,
    updateStableCategoryOrder,
    setSelectedEmailIndex,
  } = useInboxActions();

  const { mode } = useInboxFiltersCtx();

  if (loading) {
    return <InboxLoadingState />;
  }

  if (fetchError === ERROR_CODE_GMAIL_REQUIRED) {
    return <GmailConnectionScreen />;
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        backgroundColor: theme.colors.background.default,
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {keyboardShortcuts.pendingArchive && (
          <ArchiveConfirmationToast
            emailCount={keyboardShortcuts.pendingArchive.emailIds.length}
            onConfirm={() => {
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
            const threadIds = emails.filter(event => !event.isArchived).map(event => event.threadId);
            await generateDrafts(threadIds);
          }}
          onRetry={fetchEmails}
          updateDraft={updateDraft}
          bulkSend={bulkSend}
          fetchThreadsWithDrafts={fetchThreadsWithDrafts}
          emailListRef={emailListRef}
          emailDetailRef={emailDetailRef}
          expandedCategories={expandedCategories}
          stableCategoryOrder={stableCategoryOrder}
          onToggleCategory={toggleCategory}
          onUpdateStableCategoryOrder={updateStableCategoryOrder}
          categorySummary={categorySummary}
          loadedCategoryNames={loadedCategoryNames}
          loadingCategoryNames={loadingCategoryNames}
          onSplitViewArchive={archivedEmailId =>
            navigateAfterSplitViewAction(archivedEmailId, emails, mode, splitView, setSelectedEmailIndex)
          }
          onSplitViewPrioritySet={(prioritizedEmailId, starCount) => {
            const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
            emailActions.handleSetStarCount(prioritizedEmailId, starCount, fakeEvent);
            navigateAfterSplitViewAction(prioritizedEmailId, emails, mode, splitView, setSelectedEmailIndex);
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

const FocusedInbox: React.FC = () => {
  return (
    <InboxProvider isFocusedMode>
      <FocusedInboxView />
    </InboxProvider>
  );
};

export default FocusedInbox;
