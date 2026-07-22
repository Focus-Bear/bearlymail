import React, { useMemo, useState } from 'react';
import { Email, InboxMode, TriageSuggestion } from 'types/email';

import { ReanalyseConfirmModal } from 'components/inbox/ReanalyseConfirmModal';
import { ResizableDivider } from 'components/inbox/ResizableDivider';
import { SplitViewPanel } from 'components/inbox/SplitViewPanel';
import { RecategorizeProgressBar } from 'components/settings/RecategorizeProgressBar';
import { FollowUpData } from 'hooks/useFollowUps';
import { useSplitView } from 'hooks/useSplitView';
import { CategorySummaryItem } from 'store/slices/emailSlice';

import {
  InboxEmailActions,
  InboxKeyboardHint,
  InboxModals,
  InboxPriorityTooltip,
  InboxSnoozeInput,
} from './inbox.types';
import { InboxEmailListPanel } from './InboxContentParts';
import { useInboxContentState } from './useInboxContentState';

export interface InboxContentProps {
  mode: InboxMode;
  emails: Email[];
  loading: boolean;
  hasInitiallyLoaded: boolean;
  loadingModeSwitch: boolean;
  decrypting: boolean;
  fetchError: string | null;
  selectedEmailIndex: number;
  selectedEmailIds: Set<string>;
  triageSuggestions: Map<string, TriageSuggestion>;
  followUpDataMap: Map<string, FollowUpData>;
  isGeneratingDrafts: boolean;
  followUpsError: string | null;
  priorityTooltip: InboxPriorityTooltip;
  keyboardHint: InboxKeyboardHint;
  snoozeInput: InboxSnoozeInput;
  emailActions: InboxEmailActions;
  modals: InboxModals;
  splitView: ReturnType<typeof useSplitView>;
  nextDelivery: Date | null;
  lastUrgentCheck: Date | null;
  onEmailClick: (emailId: string, index: number, event: React.MouseEvent) => void;
  onEmailSelect: (emailId: string, event: React.MouseEvent | KeyboardEvent) => void;
  onGenerateDrafts: () => Promise<void>;
  onRetry: () => void;
  updateDraft?: (followUpId: string, draft: string) => Promise<void>;
  bulkSend?: (followUpIds: string[]) => Promise<void>;
  fetchThreadsWithDrafts: () => void;
  emailListRef: React.RefObject<HTMLDivElement | null>;
  emailDetailRef: React.RefObject<HTMLDivElement | null>;
  onSplitViewArchive?: (emailId: string) => void;
  onSplitViewSnooze?: (emailId: string) => void;
  onSplitViewPrioritySet?: (emailId: string, starCount: number) => void;
  onBulkArchive?: (emailIds: string[]) => Promise<void>;
  expandedCategories: Set<string>;
  stableCategoryOrder: string[];
  onToggleCategory: (category: string) => void;
  onUpdateStableCategoryOrder: (categories: string[]) => void;
  categorySummary?: CategorySummaryItem[] | null;
  loadedCategoryNames?: string[];
  loadingCategoryNames?: string[];
  fetchCategoryEmails?: (categoryName: string) => void;
  /** Current active priority filter lower bound for progressive unlock */
  minPriority?: number | null;
  /** Current active priority filter upper bound (null = no upper cap) */
  maxPriority?: number | null;
  /** Counts of threads per priority tier for progressive unlock prompt */
  priorityCounts?: {
    veryHigh: number;
    high: number;
    medium: number;
    low: number;
    veryLow: number;
    unprioritised: number;
  } | null;
  /** Action conversations waiting at the start of this Triage session (for the peek prompt copy) */
  existingActionCount?: number;
  /** Follow-Up conversations waiting at the start of this Triage session (for the peek prompt copy) */
  existingFollowUpCount?: number;
  /** Primary CTA on the guided peek prompt: go deal with the waiting Action work. */
  onTakeAction?: () => void;
  /** Called when user asks to peek at lower-priority emails (min=null, max=High floor) */
  onUnlockPriorityTier?: (minPriority: number | null, maxPriority: number | null) => void;
  /** Called when user clicks "Show all emails" to clear the priority filter */
  onClearFilters?: () => void;
}

export const InboxContent: React.FC<InboxContentProps> = props => {
  const {
    mode,
    emails,
    loading,
    hasInitiallyLoaded,
    loadingModeSwitch,
    decrypting,
    fetchError,
    selectedEmailIndex,
    selectedEmailIds,
    triageSuggestions,
    followUpDataMap,
    isGeneratingDrafts,
    followUpsError,
    priorityTooltip,
    keyboardHint,
    snoozeInput,
    emailActions,
    modals,
    splitView,
    nextDelivery,
    lastUrgentCheck,
    onEmailClick,
    onEmailSelect,
    onGenerateDrafts,
    onRetry,
    updateDraft,
    bulkSend,
    fetchThreadsWithDrafts,
    emailListRef,
    emailDetailRef,
    onSplitViewArchive,
    onSplitViewSnooze,
    onSplitViewPrioritySet,
    onBulkArchive,
    expandedCategories,
    stableCategoryOrder,
    onToggleCategory,
    onUpdateStableCategoryOrder,
    categorySummary,
    loadedCategoryNames,
    minPriority,
    maxPriority,
    priorityCounts,
    existingActionCount,
    existingFollowUpCount,
    onTakeAction,
    onUnlockPriorityTier,
    onClearFilters,
  } = props;

  const {
    isMobile,
    isRefetchingWithoutData,
    splitViewContainerRef,
    emailCategoryMap,
    otherProtoGroups,
    displayCategories,
    protoCategories,
    isReanalysingOther,
    convertingProtoCategoryId,
    deletingProtoCategoryId,
    handleReanalyseOther,
    handleConvertProtoCategory,
    handleDeleteProtoCategoryFromInbox,
    recategorizeProgress,
    dismissRecategorizeProgress,
    handleSplitViewArchive,
    handleSplitViewSnooze,
    handleSplitViewPrioritySet,
    handleSendFollowUp,
  } = useInboxContentState({
    mode,
    emails,
    categorySummary,
    stableCategoryOrder,
    expandedCategories,
    onUpdateStableCategoryOrder,
    onSplitViewArchive,
    onSplitViewSnooze,
    onSplitViewPrioritySet,
    updateDraft,
    bulkSend,
    fetchThreadsWithDrafts,
  });

  const selectedEmailForPanel = useMemo(
    () => (splitView.selectedEmailId ? emails.find(email => email.id === splitView.selectedEmailId) : undefined),
    [emails, splitView.selectedEmailId]
  );

  // The reanalyse button on the "Other" accordion recategorises the WHOLE inbox,
  // so require an explicit confirmation that states the real scope before starting.
  const [showReanalyseConfirm, setShowReanalyseConfirm] = useState(false);
  const handleConfirmReanalyse = () => {
    setShowReanalyseConfirm(false);
    void handleReanalyseOther();
  };

  const listPanelProps = {
    emailListRef,
    isMobile,
    splitView,
    mode,
    emails,
    loading,
    isRefetchingWithoutData,
    hasInitiallyLoaded,
    loadingModeSwitch,
    decrypting,
    fetchError,
    nextDelivery,
    lastUrgentCheck,
    isGeneratingDrafts,
    followUpsError,
    categorySummary,
    displayCategories,
    emailCategoryMap,
    otherProtoGroups,
    protoCategories,
    isReanalysingOther,
    convertingProtoCategoryId,
    deletingProtoCategoryId,
    expandedCategories,
    loadedCategoryNames,
    selectedEmailIds,
    selectedEmailIndex,
    triageSuggestions,
    followUpDataMap,
    priorityTooltip,
    keyboardHint,
    snoozeInput,
    emailActions,
    modals,
    updateDraft,
    onEmailClick,
    onEmailSelect,
    onSendFollowUp: handleSendFollowUp,
    onGenerateDrafts,
    onRetry,
    onToggleCategory,
    onBulkArchive,
    onConvertProtoCategory: handleConvertProtoCategory,
    onDeleteProtoCategoryFromInbox: handleDeleteProtoCategoryFromInbox,
    onReanalyseOther: () => setShowReanalyseConfirm(true),
    minPriority,
    maxPriority,
    priorityCounts,
    existingActionCount,
    existingFollowUpCount,
    onTakeAction,
    onUnlockPriorityTier,
    onClearFilters,
    unprioritisedCount: priorityCounts?.unprioritised ?? 0,
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      <RecategorizeProgressBar progress={recategorizeProgress} onDismiss={dismissRecategorizeProgress} />
      <ReanalyseConfirmModal
        isOpen={showReanalyseConfirm}
        onConfirm={handleConfirmReanalyse}
        onCancel={() => setShowReanalyseConfirm(false)}
      />
      <div ref={splitViewContainerRef} style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
        <InboxEmailListPanel {...listPanelProps} />
        {!splitView.isMobile && splitView.selectedEmailId && !splitView.panelExpanded && (
          <ResizableDivider
            onResize={splitView.setSplitPosition}
            onResizeStart={splitView.startResize}
            onResizeEnd={splitView.endResize}
            position={splitView.splitPosition}
            containerRef={splitViewContainerRef}
          />
        )}
        {!splitView.isMobile && splitView.selectedEmailId && (
          <SplitViewPanel
            selectedEmailId={splitView.selectedEmailId}
            selectedEmail={selectedEmailForPanel}
            panelExpanded={splitView.panelExpanded}
            splitPosition={splitView.splitPosition}
            isResizing={splitView.isResizing}
            emailDetailRef={emailDetailRef}
            onTogglePanel={splitView.togglePanel}
            onClose={splitView.closeEmail}
            onArchiveComplete={handleSplitViewArchive}
            onSnoozeComplete={handleSplitViewSnooze}
            onPrioritySet={handleSplitViewPrioritySet}
            mode={mode}
          />
        )}
      </div>
    </div>
  );
};
