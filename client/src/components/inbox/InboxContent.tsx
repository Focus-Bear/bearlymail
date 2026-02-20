import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email, InboxMode, getEmailPriorityScore } from 'types/email';
import { API_URL } from 'config/api';
import { MODE_TRIAGE, MODE_FOLLOW_UP } from 'constants/strings';
import { ResizableDivider } from 'components/inbox/ResizableDivider';
import { EmailListItem } from 'components/inbox/EmailListItem';
import { SplitViewPanel } from 'components/inbox/SplitViewPanel';
import { EmailListStates } from 'components/inbox/EmailListStates';
import { FollowUpActions } from 'components/inbox/FollowUpActions';
import { DebugView } from 'components/inbox/DebugView';
import { BatchInfoBar } from 'components/inbox/BatchInfoBar';
import { useSplitView } from 'hooks/useSplitView';
import { CategoryAccordion, groupEmailsByCategory } from 'components/inbox/CategoryAccordion';
import { useNotifications } from 'contexts/NotificationContext';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

interface InboxContentProps {
  mode: InboxMode;
  emails: Email[];
  loading: boolean;
  hasInitiallyLoaded: boolean;
  loadingModeSwitch: boolean;
  decrypting: boolean;
  fetchError: string | null;
  selectedEmailIndex: number;
  selectedEmailIds: Set<string>;
  triageSuggestions: Map<string, any>;
  followUpDataMap: Map<string, any>;
  isGeneratingDrafts: boolean;
  followUpsError: string | null;
  priorityTooltip: any;
  keyboardHint: any;
  snoozeInput: any;
  emailActions: any;
  modals: any;
  splitView: ReturnType<typeof useSplitView>;
  nextDelivery: Date | null;
  lastUrgentCheck: Date | null;
  onEmailClick: (emailId: string, index: number, e: React.MouseEvent) => void;
  onEmailSelect: (emailId: string, e: React.MouseEvent) => void;
  onGenerateDrafts: () => Promise<void>;
  onRetry: () => void;
  updateDraft?: (followUpId: string, draft: string) => Promise<void>;
  bulkSend?: (followUpIds: string[]) => Promise<void>;
  fetchThreadsWithDrafts: () => void;
  emailListRef: React.RefObject<HTMLDivElement | null>;
  emailDetailRef: React.RefObject<HTMLDivElement | null>;
  onSplitViewArchive?: (emailId: string) => void;
  onSplitViewSnooze?: (emailId: string) => void;
  onBulkArchive?: (emailIds: string[]) => Promise<void>;
  expandedCategories: Set<string>;
  stableCategoryOrder: string[];
  onToggleCategory: (category: string) => void;
  onUpdateStableCategoryOrder: (categories: string[]) => void;
}

// eslint-disable-next-line max-lines-per-function -- Inbox content component requires handling multiple inbox modes, emails, and UI states
export const InboxContent: React.FC<InboxContentProps> = ({
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
  onBulkArchive,
  expandedCategories,
  stableCategoryOrder,
  onToggleCategory,
  onUpdateStableCategoryOrder,
}) => {
  const { t } = useTranslation();
  const { showNotification } = useNotifications();
  const { isMobile } = useResponsiveBreakpoints();
  const splitViewContainerRef = useRef<HTMLDivElement>(null);
  const [isReanalysingOther, setIsReanalysingOther] = useState(false);

  const handleReanalyseOther = async () => {
    setIsReanalysingOther(true);
    try {
      const response = await axios.post(`${API_URL}/context/generate-categories-from-other`);
      const { newCategoriesCount, reclassifyJobsQueued } = response.data;
      
      if (newCategoriesCount > 0) {
        showNotification(
          t('inbox.category.reanalyseSuccess', { count: newCategoriesCount, reclassifyCount: reclassifyJobsQueued }),
          'success'
        );
      } else {
        showNotification(
          t('inbox.category.reanalyseNoNewCategories'),
          'info'
        );
      }
    } catch (error) {
      console.error('Error re-analysing categories:', error);
      showNotification(
        'Failed to re-analyse categories. Please try again.',
        'error'
      );
    } finally {
      setIsReanalysingOther(false);
    }
  };

  const filteredEmails = useMemo(() =>
    emails.filter(email => !email.isArchived),
    [emails]
  );

  const categoryGroups = useMemo(() => 
    groupEmailsByCategory(filteredEmails),
    [filteredEmails]
  );

  // Update stable category order - only set on initial load, then only append new categories.
  // This ensures the category display order is fixed once set and doesn't re-sort when
  // emails are archived/starred (which would change maxPriority and cause layout shifts).
  useEffect(() => {
    if (categoryGroups.length > 0) {
      if (stableCategoryOrder.length === 0) {
        // Initial load - set the order based on priority sorting
        onUpdateStableCategoryOrder(categoryGroups.map(g => g.category));
      } else {
        // Only add new categories that aren't already in the stable order
        const newCategories = categoryGroups
          .filter(g => !stableCategoryOrder.includes(g.category))
          .map(g => g.category);
        
        if (newCategories.length > 0) {
          onUpdateStableCategoryOrder([...stableCategoryOrder, ...newCategories]);
        }
      }
    }
  }, [categoryGroups, stableCategoryOrder, onUpdateStableCategoryOrder]);

  const sortedCategoryGroups = useMemo(() => {
    if (stableCategoryOrder.length === 0) {
      return categoryGroups;
    }
    
    const orderMap = new Map(stableCategoryOrder.map((cat, idx) => [cat, idx]));
    
    return [...categoryGroups].sort((a, b) => {
      const orderA = orderMap.get(a.category) ?? Number.MAX_SAFE_INTEGER;
      const orderB = orderMap.get(b.category) ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
  }, [categoryGroups, stableCategoryOrder]);

  const selectedEmailForPanel = useMemo(() => 
    splitView.selectedEmailId ? emails.find(e => e.id === splitView.selectedEmailId) : undefined,
    [emails, splitView.selectedEmailId]
  );

  const handleSplitViewArchive = useCallback((emailId: string) => {
    if (onSplitViewArchive && emailId) {
      onSplitViewArchive(emailId);
    }
  }, [onSplitViewArchive]);

  const handleSplitViewSnooze = useCallback((emailId: string) => {
    if (onSplitViewSnooze && emailId) {
      onSplitViewSnooze(emailId);
    }
  }, [onSplitViewSnooze]);

  const handleSendFollowUp = async (followUpId: string, draft: string, recipientName?: string) => {
    try {
      const response = await axios.post(
        `${API_URL}/follow-ups/${followUpId}/review-draft`,
        { draft, recipientName }
      );
      const reviewedDraft = response.data;
      
      if (reviewedDraft !== draft && updateDraft) {
        await updateDraft(followUpId, reviewedDraft);
      }
      
      if (bulkSend) {
        await bulkSend([followUpId]);
      }
      fetchThreadsWithDrafts();
    } catch (error) {
      console.error('Error reviewing or sending follow-up:', error);
      if (bulkSend) {
        await bulkSend([followUpId]);
      }
      fetchThreadsWithDrafts();
    }
  };

  return (
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
          flex: (() => {
            if (splitView.panelExpanded && splitView.selectedEmailId) return 0;
            if (splitView.selectedEmailId) return `0 0 ${splitView.splitPosition}%`;
            return 1;
          })(),
          overflowY: 'auto',
          padding: isMobile
            ? `${theme.spacing.sm} ${theme.spacing.xs}`
            : `${theme.spacing.md} ${theme.spacing.lg} ${theme.spacing.lg}`,
          transition: splitView.isResizing ? 'none' : 'flex 0.3s ease',
          borderRight: splitView.selectedEmailId && !splitView.panelExpanded && !splitView.isMobile ? `1px solid ${theme.colors.border.light}` : 'none',
        }}
      >
        <div style={{ maxWidth: splitView.selectedEmailId ? '100%' : '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? theme.spacing.xs : theme.spacing.md }}>
          {mode === MODE_TRIAGE && (
            <BatchInfoBar
              nextDelivery={nextDelivery}
              lastUrgentCheck={lastUrgentCheck}
            />
          )}
          {mode === MODE_FOLLOW_UP && (
            <FollowUpActions
              onGenerateDrafts={onGenerateDrafts}
              isGenerating={isGeneratingDrafts}
              error={followUpsError}
              onRetry={onRetry}
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
            onRetry={onRetry}
          />
          {!loading && hasInitiallyLoaded && !loadingModeSwitch && !fetchError && filteredEmails.length > 0 && (
            sortedCategoryGroups.map((group) => {
              const isExpanded = expandedCategories.has(group.category);
              let globalIndex = 0;
              for (const g of sortedCategoryGroups) {
                if (g.category === group.category) break;
                globalIndex += g.emails.length;
              }
              
              return (
                <CategoryAccordion
                  key={group.category}
                  category={group.category}
                  emails={group.emails}
                  isExpanded={isExpanded}
                  onToggle={() => onToggleCategory(group.category)}
                  onArchiveAll={onBulkArchive}
                  onReanalyseOther={handleReanalyseOther}
                  isReanalysingOther={isReanalysingOther}
                >
                  {group.emails.map((email, indexInCategory) => {
                    const emailIndex = globalIndex + indexInCategory;
                    const suggestion = mode === MODE_TRIAGE ? (triageSuggestions.get(email.id) || null) : null;
                    const isSelected = selectedEmailIds.has(email.id) || selectedEmailIndex === emailIndex;
                    const followUpData = mode === MODE_FOLLOW_UP ? followUpDataMap.get(email.threadId) : null;
                    return (
                      <EmailListItem
                        key={email.id}
                        email={email}
                        index={emailIndex}
                        mode={mode}
                        isSelected={isSelected}
                        suggestion={suggestion}
                        priorityTooltip={priorityTooltip}
                        keyboardHint={keyboardHint}
                        snoozeInput={snoozeInput}
                        onEmailClick={onEmailClick}
                        onEmailSelect={onEmailSelect}
                        onSetStarCount={emailActions.handleSetStarCount}
                        onArchive={emailActions.handleArchive}
                        onBlockSender={emailActions.handleBlockSender}
                        onSnooze={emailActions.handleSnooze}
                        onOverrideUrgency={() => {
                          if (email.emailThreadId && email.urgencyScore !== undefined) {
                            modals.showUrgencyOverride(email.emailThreadId, email.urgencyScore);
                          }
                        }}
                        onProvideFeedback={() => {
                          priorityTooltip.hidePriorityTooltip();
                          modals.showPriorityFeedback(email.id, getEmailPriorityScore(email));
                        }}
                        followUpData={followUpData}
                        onUpdateDraft={updateDraft}
                        onSendFollowUp={(followUpId: string, draft: string) => 
                          handleSendFollowUp(followUpId, draft, (email as any).otherPersonName)
                        }
                        recipientName={(email as any).otherPersonName}
                      />
                    );
                  })}
                </CategoryAccordion>
              );
            })
          )}
          <DebugView emails={emails} />
        </div>
      </div>

      {/* Resizable Divider */}
      {!splitView.isMobile && splitView.selectedEmailId && !splitView.panelExpanded && (
        <ResizableDivider
          onResize={splitView.setSplitPosition}
          onResizeStart={splitView.startResize}
          onResizeEnd={splitView.endResize}
          position={splitView.splitPosition}
          containerRef={splitViewContainerRef}
        />
      )}

      {/* Email Detail Panel */}
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
          mode={mode}
        />
      )}
    </div>
  );
};

