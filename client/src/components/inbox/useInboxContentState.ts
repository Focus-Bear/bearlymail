import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Email, InboxMode } from 'types/email';

import { MODE_BLOCKED } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useDebugViewOpen } from 'hooks/useDebugViewOpen';
import { useProtoCategoryManagement } from 'hooks/useProtoCategoryManagement';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { selectSummaryLoading } from 'store/selectors/emailSelectors';
import { CategorySummaryItem } from 'store/slices/emailSlice';

import {
  buildDisplayCategories,
  buildEmailCategoryMap,
  buildOtherProtoGroups,
  shouldFetchProtoCategories,
} from './inboxCategoryHelpers';
import { useInboxCategorySync } from './useInboxCategorySync';
import { useInboxSplitViewHandlers } from './useInboxSplitViewHandlers';

interface UseInboxContentStateParams {
  mode: InboxMode;
  emails: Email[];
  categorySummary?: CategorySummaryItem[] | null;
  stableCategoryOrder: string[];
  expandedCategories: Set<string>;
  onUpdateStableCategoryOrder: (categories: string[]) => void;
  onSplitViewArchive?: (emailId: string) => void;
  onSplitViewSnooze?: (emailId: string) => void;
  onSplitViewPrioritySet?: (emailId: string, starCount: number) => void;
  updateDraft?: (followUpId: string, draft: string) => Promise<void>;
  bulkSend?: (followUpIds: string[]) => Promise<void>;
  fetchThreadsWithDrafts: () => void;
  /** Refetches the inbox so promoted proto-category emails move out of "Other". */
  onRefreshInbox?: () => void;
}

export function useInboxContentState({
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
  onRefreshInbox,
}: UseInboxContentStateParams) {
  const { isMobile } = useResponsiveBreakpoints();
  const summaryLoading = useSelector(selectSummaryLoading);
  const isRefetchingWithoutData = summaryLoading && (categorySummary === null || categorySummary === undefined);
  const splitViewContainerRef = useRef<HTMLDivElement>(null);

  const {
    protoCategories,
    isReanalysingOther,
    convertingProtoCategoryId,
    deletingProtoCategoryId,
    fetchProtoCategories,
    handleReanalyseOther,
    handleConvertProtoCategory,
    handleDeleteProtoCategoryFromInbox,
    recategorizeProgress,
    dismissRecategorizeProgress,
  } = useProtoCategoryManagement({ onPromoted: onRefreshInbox });

  const splitViewHandlers = useInboxSplitViewHandlers({
    mode,
    onSplitViewArchive,
    onSplitViewSnooze,
    onSplitViewPrioritySet,
    updateDraft,
    bulkSend,
    fetchThreadsWithDrafts,
  });

  // Blocked-mode emails are archived by definition (isArchived=true), so we must
  // skip the isArchived filter when in blocked mode or the list would always be empty.
  const filteredEmails = useMemo(
    () => (mode === MODE_BLOCKED ? emails : emails.filter(email => !email.isArchived)),
    [emails, mode]
  );
  const emailCategoryMap = useMemo(
    () => buildEmailCategoryMap(filteredEmails, mode, categorySummary),
    [filteredEmails, mode, categorySummary]
  );
  const otherProtoGroups = useMemo(() => buildOtherProtoGroups(emailCategoryMap), [emailCategoryMap]);

  const summaryCategories = categorySummary !== undefined ? categorySummary : null;

  useInboxCategorySync({ summaryCategories, filteredEmails, stableCategoryOrder, onUpdateStableCategoryOrder, mode });

  const { user } = useAuth();
  const { debugViewOpen } = useDebugViewOpen();
  // Admins with the debug view open keep empty sections so the inline category
  // debug panel can explain them; everyone else never sees a section without rows.
  const includeEmptyCategories = user?.isAdmin === true && debugViewOpen;
  const displayCategories = useMemo(
    () => buildDisplayCategories(summaryCategories, filteredEmails, stableCategoryOrder, mode, includeEmptyCategories),
    [summaryCategories, filteredEmails, stableCategoryOrder, mode, includeEmptyCategories]
  );

  useEffect(() => {
    if (shouldFetchProtoCategories(displayCategories, expandedCategories)) {
      fetchProtoCategories();
    }
  }, [expandedCategories, displayCategories, fetchProtoCategories]);

  return {
    isMobile,
    isRefetchingWithoutData,
    splitViewContainerRef,
    filteredEmails,
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
    ...splitViewHandlers,
  };
}
