import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { devLog } from 'utils/dev-logger';

import { API_URL } from 'config/api';
import { SYNC_STATUS_IDLE_POLL_LIMIT, SYNC_STATUS_POLL_INTERVAL_MS } from 'constants/numbers';
import { GmailAccessIssue } from 'constants/strings';

interface SyncStatusResponse {
  isSyncing: boolean;
  lastSyncAt: string | null;
  gmailAccessIssue?: GmailAccessIssue | null;
}

interface SyncStatus {
  isSyncing: boolean;
  /** Undefined until the first poll answers; null once the server reports Gmail is readable. */
  gmailAccessIssue: GmailAccessIssue | null | undefined;
}

interface UseSyncStatusProps {
  /**
   * Only poll when this is true. The inbox enables it when the list is empty /
   * just loaded so we never poll forever on a populated inbox.
   */
  enabled: boolean;
  /** Called once when a sync transitions from in-progress → finished, so the inbox can refetch. */
  onSyncComplete?: () => void;
}

/**
 * Polls GET /emails/sync-status every few seconds while `enabled`, exposing
 * `{ isSyncing }`. To avoid polling forever, it stops after a couple of
 * consecutive "not syncing" ticks and only resumes when `enabled` toggles.
 * Network errors are treated as "not syncing" so a transient failure never
 * strands the UI in a syncing state.
 */
export function useSyncStatus({ enabled, onSyncComplete }: UseSyncStatusProps): SyncStatus {
  const [isSyncing, setIsSyncing] = useState(false);
  const [gmailAccessIssue, setGmailAccessIssue] = useState<GmailAccessIssue | null | undefined>(undefined);

  // Ref-based callback so the interval always calls the latest onSyncComplete
  // without being a dependency (which would restart the interval each render).
  const onSyncCompleteRef = useRef<(() => void) | undefined>(onSyncComplete);
  onSyncCompleteRef.current = onSyncComplete;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let idleTicks = 0;
    let wasSyncing = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      let syncing = false;
      try {
        const response = await axios.get<SyncStatusResponse>(`${API_URL}/emails/sync-status`);
        syncing = !!response.data?.isSyncing;
        if (!cancelled) {
          setGmailAccessIssue(response.data?.gmailAccessIssue ?? null);
        }
      } catch {
        // Treat a failed probe as "not syncing" — never strand the UI.
        syncing = false;
      }
      if (cancelled) {
        return;
      }

      setIsSyncing(syncing);

      // Detect the in-progress → finished transition and refetch the inbox.
      if (wasSyncing && !syncing) {
        devLog('[SyncStatus] sync finished — triggering refetch');
        onSyncCompleteRef.current?.();
      }
      wasSyncing = syncing;

      // Relax polling once we've seen "not syncing" a couple of times in a row.
      if (syncing) {
        idleTicks = 0;
      } else {
        idleTicks += 1;
        if (idleTicks >= SYNC_STATUS_IDLE_POLL_LIMIT && interval) {
          clearInterval(interval);
          interval = undefined;
        }
      }
    };

    // Kick off immediately, then on an interval.
    void poll();
    interval = setInterval(() => void poll(), SYNC_STATUS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [enabled]);

  return { isSyncing, gmailAccessIssue };
}
