import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { ComparisonResultsGrid } from 'components/inbox/debug/ComparisonResultsGrid';
import { StarredComparisonGrid } from 'components/inbox/debug/StarredComparisonGrid';
import { StarredThreadsList } from 'components/inbox/debug/StarredThreadsList';
import { DebugStarredData } from 'components/inbox/debug/types';
import { COLOR_NAMED_WHITE, COLOR_WHITE } from 'constants/colors';
import { EMOJI_SEARCH } from 'constants/emojis';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

interface DebugStarredSectionProps {
  debugStarredData: DebugStarredData | null;
  loadingDebugData: boolean;
  onFetchDebugStarred: () => Promise<void>;
}

/**
 * Debug starred section component
 * Displays starred threads debug information
 */
export const DebugStarredSection: React.FC<DebugStarredSectionProps> = ({
  debugStarredData,
  loadingDebugData,
  onFetchDebugStarred,
}) => {
  const { t } = useTranslation();
  const [showSyncPopup, setShowSyncPopup] = React.useState(false);

  const handleCheckStarredSync = async () => {
    await onFetchDebugStarred();
    setShowSyncPopup(true);
  };

  // Derive comparison data from threads[] (new API shape — no separate comparison object)
  const inGmailNotInDb = (debugStarredData?.threads ?? [])
    .filter(thread => !thread.inDb)
    .map(thread => thread.threadId);
  // inDbNotInGmail is no longer available in the new API response shape
  const inDbNotInGmail: string[] = [];
  const actionTabResults = debugStarredData?.summary?.inActionOrFollowUp ?? 0;

  return (
    <div
      style={{
        marginBottom: theme.spacing.lg,
        padding: theme.spacing.md,
        backgroundColor: COLOR_WHITE,
        borderRadius: theme.borderRadius.md,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
        <h4 style={{ margin: 0 }}>
          {EMOJI_SEARCH} {t('debug.starred.title')}
        </h4>
        <button
          onClick={handleCheckStarredSync}
          disabled={loadingDebugData}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            backgroundColor: theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.sm,
            cursor: loadingDebugData ? 'not-allowed' : 'pointer',
            opacity: loadingDebugData ? OPACITY_DISABLED : OPACITY_FULL,
          }}
        >
          {loadingDebugData ? t('common.loading') : 'Check starred sync'}
        </button>
      </div>

      {debugStarredData && (
        <div>
          {debugStarredData.summary && (
            <StarredComparisonGrid summary={debugStarredData.summary} gmailError={debugStarredData.gmailError} />
          )}
          {inGmailNotInDb.length > 0 && (
            <ComparisonResultsGrid
              inGmailNotInDb={inGmailNotInDb}
              inDbNotInGmail={inDbNotInGmail}
              actionTabResults={actionTabResults}
            />
          )}
          <StarredThreadsList threads={debugStarredData.threads ?? []} />
        </div>
      )}

      {showSyncPopup && debugStarredData && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: theme.colors.overlay.darkLight,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowSyncPopup(false)}
        >
          <div
            style={{
              backgroundColor: COLOR_WHITE,
              borderRadius: theme.borderRadius.md,
              padding: theme.spacing.md,
              maxWidth: 900,
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onClick={event => event.stopPropagation()}
          >
            <h4 style={{ marginTop: 0 }}>
              Starred Sync Check Results — {debugStarredData.summary?.gmailStarredCount ?? 0} Gmail starred threads
            </h4>
            {debugStarredData.gmailError && (
              <p style={{ color: 'red', marginTop: 0 }}>Gmail error: {debugStarredData.gmailError}</p>
            )}
            {debugStarredData.summary && (
              <p style={{ marginTop: 0 }}>
                {debugStarredData.summary.foundInDb} of {debugStarredData.summary.gmailStarredCount} starred Gmail
                threads are in the DB. {debugStarredData.summary.notInDb} are missing.{' '}
                {debugStarredData.summary.inActionOrFollowUp} appear in Action/Follow-up.
              </p>
            )}

            {/* Per-thread accordion view */}
            <StarredThreadsList threads={debugStarredData.threads ?? []} />

            <h5>Unsynced for more than 5 minutes</h5>
            {debugStarredData.staleUnsyncedThreads?.length ? (
              <>
                <ul>
                  {debugStarredData.staleUnsyncedThreads.map(thread => (
                    <li key={thread.threadId}>
                      {thread.threadId} — {thread.minutesUnsynced} min (archived: {String(thread.isArchived)},
                      starCount: {thread.starCount})
                    </li>
                  ))}
                </ul>
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch(
                        `${import.meta.env.REACT_APP_API_URL || 'http://localhost:3001'}/emails/debug/fix-stale-unsynced`,
                        {
                          method: 'POST',
                          credentials: 'include',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                        }
                      );
                      if (response.ok) {
                        const result = await response.json();
                        alert(`Fixed ${result.fixed} stale unsynced threads`);
                        await onFetchDebugStarred(); // Refresh the data
                      } else {
                        alert('Failed to fix stale unsynced threads');
                      }
                    } catch (error) {
                      alert(`Error fixing stale unsynced threads: ${error}`);
                    }
                  }}
                  style={{
                    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                    backgroundColor: theme.colors.warning?.main || '#ff9800',
                    color: COLOR_WHITE,
                    border: STRING_NONE,
                    borderRadius: theme.borderRadius.sm,
                    cursor: 'pointer',
                    marginBottom: theme.spacing.sm,
                  }}
                >
                  Fix Stale Unsynced Threads
                </button>
              </>
            ) : (
              <p>No stale unsynced threads found.</p>
            )}

            <button
              onClick={() => setShowSyncPopup(false)}
              style={{
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                backgroundColor: theme.colors.primary.main,
                color: COLOR_WHITE,
                border: STRING_NONE,
                borderRadius: theme.borderRadius.sm,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
