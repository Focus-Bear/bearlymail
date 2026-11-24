import { useCallback, useMemo, useState } from 'react';
import { captureEvent } from 'utils/posthog';
import { isSafeHttpsUrl } from 'utils/unsubscribeUtils';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { archiveListSender, fetchMailingLists, MailingList, unsubscribeFromList } from './mailingLists.api';

export const CLEANUP_PHASES = {
  IDLE: 'idle',
  CONFIRMING: 'confirming',
  RUNNING: 'running',
  DONE: 'done',
} as const;

export type CleanupPhase = (typeof CLEANUP_PHASES)[keyof typeof CLEANUP_PHASES];

export interface CleanupResult {
  unsubscribed: MailingList[];
  /** Senders that need the user to finish on their website. */
  toFinish: Array<{ list: MailingList; url: string }>;
  failed: MailingList[];
  archivedThreads: number;
}

const EMPTY_RESULT: CleanupResult = { unsubscribed: [], toFinish: [], failed: [], archivedThreads: 0 };

/**
 * Unsubscribes from one list and archives its sender. The archive runs even if
 * the unsubscribe fails: the user asked for these emails to go away either way.
 */
async function cleanUpOne(list: MailingList, result: CleanupResult): Promise<void> {
  let failed = false;
  try {
    const { finishUrl } = await unsubscribeFromList(list);
    if (finishUrl && isSafeHttpsUrl(finishUrl)) {
      result.toFinish.push({ list, url: finishUrl });
    } else if (finishUrl) {
      failed = true;
    } else {
      result.unsubscribed.push(list);
    }
  } catch {
    failed = true;
  }
  try {
    result.archivedThreads += await archiveListSender(list);
  } catch {
    failed = true;
  }
  if (failed) {
result.failed.push(list);
}
}

/**
 * Settings → Subscriptions: loads the user's mailing lists, tracks which are
 * ticked, and unsubscribes + archives them one at a time (a one-click request
 * can take seconds, so one request per sender keeps each call short and lets
 * the user watch the progress).
 */
export function useMailingListCleanup(onChanged?: () => void) {
  const [lists, setLists] = useState<MailingList[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<CleanupPhase>(CLEANUP_PHASES.IDLE);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<CleanupResult>(EMPTY_RESULT);

  const load = useCallback(async () => {
    setIsLoading(true);
    setHasLoadError(false);
    try {
      setLists(await fetchMailingLists());
      setSelectedIds(new Set());
    } catch {
      setHasLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggle = useCallback((emailId: string) => {
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(emailId)) {
next.delete(emailId);
} else {
next.add(emailId);
}
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds(previous =>
      lists && previous.size < lists.length ? new Set(lists.map(list => list.emailId)) : new Set()
    );
  }, [lists]);

  const selected = useMemo(() => (lists ?? []).filter(list => selectedIds.has(list.emailId)), [lists, selectedIds]);

  const run = useCallback(async () => {
    const outcome: CleanupResult = { unsubscribed: [], toFinish: [], failed: [], archivedThreads: 0 };
    setPhase(CLEANUP_PHASES.RUNNING);
    setProgress({ done: 0, total: selected.length });
    for (const [index, list] of selected.entries()) {
      await cleanUpOne(list, outcome);
      setProgress({ done: index + 1, total: selected.length });
    }
    captureEvent(ANALYTICS_EVENTS.MAILING_LISTS_CLEANED_UP, {
      senders: selected.length,
      unsubscribed: outcome.unsubscribed.length,
      to_finish: outcome.toFinish.length,
      failed: outcome.failed.length,
      archived_threads: outcome.archivedThreads,
    });
    setResult(outcome);
    setPhase(CLEANUP_PHASES.DONE);
    onChanged?.();
    await load();
  }, [selected, load, onChanged]);

  return {
    lists,
    isLoading,
    hasLoadError,
    load,
    selectedIds,
    selected,
    toggle,
    toggleAll,
    phase,
    progress,
    result,
    askToConfirm: () => setPhase(CLEANUP_PHASES.CONFIRMING),
    cancel: () => setPhase(CLEANUP_PHASES.IDLE),
    run,
    dismissResult: () => setPhase(CLEANUP_PHASES.IDLE),
  };
}
