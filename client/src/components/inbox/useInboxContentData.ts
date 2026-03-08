import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { Email, InboxMode } from 'types/email';

import { API_URL } from 'config/api';
import { CATEGORY_OTHER } from 'constants/strings';
import { getCategoryKey } from 'hooks/useEmailFetching';
import { useProtoCategoryManagement } from 'hooks/useProtoCategoryManagement';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { selectSummaryLoading } from 'store/selectors/emailSelectors';
import { CategorySummaryItem } from 'store/slices/emailSlice';

import { groupEmailsByCategory } from './CategoryAccordion';

interface UseInboxContentDataParams {
  mode: InboxMode;
  emails: Email[];
  categorySummary: CategorySummaryItem[] | null | undefined;
  stableCategoryOrder: string[];
  expandedCategories: Set<string>;
  onUpdateStableCategoryOrder: (order: string[]) => void;
  onSplitViewArchive?: (emailId: string) => void;
  onSplitViewSnooze?: (emailId: string) => void;
  onSplitViewPrioritySet?: (emailId: string, starCount: number) => void;
  updateDraft?: (followUpId: string, draft: string) => Promise<void>;
  bulkSend?: (followUpIds: string[]) => Promise<void>;
  fetchThreadsWithDrafts: () => void;
  onLoadMore?: () => Promise<void>;
  hasMore: boolean;
  loading: boolean;
}

export function useInboxContentData({
  mode, emails, categorySummary, stableCategoryOrder, expandedCategories,
  onUpdateStableCategoryOrder, onSplitViewArchive, onSplitViewSnooze,
  onSplitViewPrioritySet, updateDraft, bulkSend, fetchThreadsWithDrafts,
  onLoadMore, hasMore, loading,
}: UseInboxContentDataParams) {
  const { isMobile } = useResponsiveBreakpoints();
  const summaryLoading = useSelector(selectSummaryLoading);
  const isRefetchingWithoutData = summaryLoading && (categorySummary === null || categorySummary === undefined);
  const splitViewContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const protoCategoryMgmt = useProtoCategoryManagement();

  const handleLoadMore = useCallback(async () => {
    if (!onLoadMore || isLoadingMoreRef.current || !hasMore) return;
    isLoadingMoreRef.current = true;
    try { await onLoadMore(); } finally { isLoadingMoreRef.current = false; }
  }, [onLoadMore, hasMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) handleLoadMore(); }, { rootMargin: '200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, handleLoadMore]);

  const filteredEmails = useMemo(() => emails.filter(email => !email.isArchived), [emails]);

  const emailCategoryMap = useMemo(() => {
    const map = new Map<string, { category: string; emails: Email[] }>();
    groupEmailsByCategory(filteredEmails, mode).forEach(group => map.set(group.category, group));

    // Re-key by UUID when category summary provides IDs.
    // groupEmailsByCategory keys by email.category (a name string from the server).
    // stableCategoryOrder / displayCategories use getCategoryKey(cat.id, cat.name) which
    // returns the UUID, so without this re-keying every accordion lookup returns undefined.
    if (categorySummary) {
      const nameToKey = new Map(categorySummary.map(cat => [cat.name, getCategoryKey(cat.id, cat.name)]));
      const rekeyed = new Map<string, { category: string; emails: Email[] }>();
      map.forEach((value, key) => {
        const uuidKey = nameToKey.get(key);
        rekeyed.set(uuidKey ?? key, { ...value, category: uuidKey ?? key });
      });
      return rekeyed;
    }
    return map;
  }, [filteredEmails, mode, categorySummary]);

  const otherProtoGroups = useMemo(() => {
    const otherEmails = emailCategoryMap.get(CATEGORY_OTHER)?.emails ?? [];
    const groups = new Map<string, Email[]>();
    otherEmails.forEach(email => {
      const protoName = (email as any).protoCategoryName;
      if (protoName) {
        if (!groups.has(protoName)) groups.set(protoName, []);
        groups.get(protoName)!.push(email);
      }
    });
    return Array.from(groups.entries()).map(([name, groupEmails]) => ({ name, emails: groupEmails }));
  }, [emailCategoryMap]);

  const summaryCategories = categorySummary !== undefined ? categorySummary : null;

  useEffect(() => {
    if (summaryCategories && summaryCategories.length > 0) {
      const summaryKeys = summaryCategories.map(cat => getCategoryKey(cat.id, cat.name));
      if (stableCategoryOrder.length === 0) {
        onUpdateStableCategoryOrder(summaryKeys);
      } else {
        const newKeys = summaryKeys.filter(key => !stableCategoryOrder.includes(key));
        if (newKeys.length > 0) onUpdateStableCategoryOrder([...stableCategoryOrder, ...newKeys]);
      }
    } else if (!summaryCategories) {
      const categoryGroups = groupEmailsByCategory(filteredEmails, mode);
      if (categoryGroups.length > 0) {
        if (stableCategoryOrder.length === 0) {
          onUpdateStableCategoryOrder(categoryGroups.map(grp => grp.category));
        } else {
          const newKeys = categoryGroups.filter(grp => !stableCategoryOrder.includes(grp.category)).map(grp => grp.category);
          if (newKeys.length > 0) onUpdateStableCategoryOrder([...stableCategoryOrder, ...newKeys]);
        }
      }
    }
  }, [summaryCategories, stableCategoryOrder, onUpdateStableCategoryOrder, filteredEmails, mode]);

  const displayCategories = useMemo(() => {
    if (!summaryCategories) {
      return stableCategoryOrder.map(key => ({ id: null as string | null, name: key, count: emailCategoryMap.get(key)?.emails.length ?? 0 }));
    }
    const summaryMap = new Map(summaryCategories.map(cat => [getCategoryKey(cat.id, cat.name), cat]));
    return stableCategoryOrder.map(key => summaryMap.get(key) ?? { id: null, name: key, count: emailCategoryMap.get(key)?.emails.length ?? 0 });
  }, [summaryCategories, stableCategoryOrder, emailCategoryMap]);

  const handleSplitViewArchive = useCallback((emailId: string) => { if (onSplitViewArchive && emailId) onSplitViewArchive(emailId); }, [onSplitViewArchive]);
  const handleSplitViewSnooze = useCallback((emailId: string) => { if (onSplitViewSnooze && emailId) onSplitViewSnooze(emailId); }, [onSplitViewSnooze]);
  const handleSplitViewPrioritySet = useCallback((emailId: string, starCount: number) => { if (onSplitViewPrioritySet && emailId) onSplitViewPrioritySet(emailId, starCount); }, [onSplitViewPrioritySet]);

  const handleSendFollowUp = async (followUpId: string, draft: string, recipientName?: string) => {
    try {
      const response = await axios.post(`${API_URL}/follow-ups/${followUpId}/review-draft`, { draft, recipientName });
      if (response.data !== draft && updateDraft) await updateDraft(followUpId, response.data);
      if (bulkSend) await bulkSend([followUpId]);
      fetchThreadsWithDrafts();
    } catch (error) {
      console.error('Error reviewing or sending follow-up:', error);
      if (bulkSend) await bulkSend([followUpId]);
      fetchThreadsWithDrafts();
    }
  };

  return {
    isMobile, isRefetchingWithoutData, splitViewContainerRef, sentinelRef,
    filteredEmails, emailCategoryMap, otherProtoGroups, displayCategories,
    handleSplitViewArchive, handleSplitViewSnooze, handleSplitViewPrioritySet,
    handleSendFollowUp, protoCategoryMgmt, loading,
  };
}
