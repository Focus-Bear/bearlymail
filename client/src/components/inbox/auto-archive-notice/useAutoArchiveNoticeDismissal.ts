import { useCallback, useState } from 'react';

import { AUTO_ARCHIVE_NOTICE_DISMISSED_KEY_PREFIX } from 'constants/autoArchive';

const isString = (value: unknown): value is string => typeof value === 'string';

function readDismissedIds(storageKey: string | null): string[] {
  if (!storageKey) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isString) : [];
  } catch {
    return [];
  }
}

function writeDismissedIds(storageKey: string | null, ids: string[]): void {
  if (!storageKey) {
    return;
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify(ids));
  } catch {
    // Storage unavailable — the notice still hides for this session
  }
}

export interface AutoArchiveNoticeDismissal {
  /** True when at least one pending proposal arrived after the last dismissal. */
  hasUndismissedProposal: boolean;
  /** Hides the notice until a proposal outside the current set shows up. */
  dismiss: () => void;
}

/**
 * Remembers, per user, which proposal ids the inbox notice was dismissed for.
 * Dismissal is tied to the set rather than a flag so the notice comes back on
 * its own when the daily scan finds something new, and stays away when the
 * set only shrinks (the user approved or dismissed some in Settings).
 */
export function useAutoArchiveNoticeDismissal(
  userId: string | undefined,
  proposalIds: string[]
): AutoArchiveNoticeDismissal {
  const storageKey = userId ? `${AUTO_ARCHIVE_NOTICE_DISMISSED_KEY_PREFIX}${userId}` : null;
  const [dismissedIds, setDismissedIds] = useState(() => readDismissedIds(storageKey));
  const [prevStorageKey, setPrevStorageKey] = useState(storageKey);

  // Re-read when the user changes (auth finishing after mount, or an account
  // switch) so the initial useState snapshot doesn't go stale.
  if (storageKey !== prevStorageKey) {
    setPrevStorageKey(storageKey);
    setDismissedIds(readDismissedIds(storageKey));
  }

  const dismiss = useCallback(() => {
    const ids = [...proposalIds].sort();
    writeDismissedIds(storageKey, ids);
    setDismissedIds(ids);
  }, [proposalIds, storageKey]);

  const hasUndismissedProposal = proposalIds.some(id => !dismissedIds.includes(id));

  return { hasUndismissedProposal, dismiss };
}
