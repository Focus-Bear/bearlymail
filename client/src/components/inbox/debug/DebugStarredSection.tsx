import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { StarredComparisonGrid } from 'components/inbox/debug/StarredComparisonGrid';
import { ComparisonResultsGrid } from 'components/inbox/debug/ComparisonResultsGrid';
import { MissingFromProcessTabList } from 'components/inbox/debug/MissingFromProcessTabList';
import { StarredThreadsList } from 'components/inbox/debug/StarredThreadsList';
import { EMOJI_SEARCH } from 'constants/emojis';
import { DebugStarredData } from 'components/inbox/debug/types';


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

  return (
    <div
      style={{
        marginBottom: theme.spacing.lg,
        padding: theme.spacing.md,
        backgroundColor: '#fff',
        borderRadius: theme.borderRadius.md,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.md,
        }}
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <h4 style={{ margin: 0 }}>{EMOJI_SEARCH} {t('debug.starred.title')}</h4>
        <button
          onClick={handleCheckStarredSync}
          disabled={loadingDebugData}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            backgroundColor: theme.colors.primary.main,
            color: 'white',
            border: 'none',
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
          <StarredComparisonGrid
            gmail={debugStarredData.gmail}
            database={debugStarredData.database}
          />
          <ComparisonResultsGrid
            inGmailNotInDb={debugStarredData.comparison.inGmailNotInDb}
            inDbNotInGmail={debugStarredData.comparison.inDbNotInGmail}
            actionTabResults={debugStarredData.actionTabResults}
          />
          <MissingFromProcessTabList missingItems={debugStarredData.missingFromProcessTab} />
          <StarredThreadsList threads={debugStarredData.starredThreads} />
        </div>
      )}

      {showSyncPopup && debugStarredData && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowSyncPopup(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: theme.borderRadius.md,
              padding: theme.spacing.md,
              maxWidth: 900,
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h4 style={{ marginTop: 0 }}>Starred Sync Check Results</h4>
            <p style={{ marginTop: 0 }}>
              Gmail search matched {debugStarredData.gmail.starredEmailCount} starred emails across {debugStarredData.gmail.starredThreadCount} threads.
            </p>
            {debugStarredData.gmailVisibilityChecks?.map((item) => (
              <div key={item.threadId} style={{ marginBottom: theme.spacing.sm }}>
                <strong>{item.threadId}</strong> — {item.visibleInAction ? 'Visible' : 'Hidden'} ({item.syncStatus})
                <ul style={{ margin: `${theme.spacing.xs} 0` }}>
                  {item.reasons.map((reason) => (
                    <li key={`${item.threadId}-${reason}`}>{reason}</li>
                  ))}
                </ul>
              </div>
            ))}

            <h5>Unsynced for more than 5 minutes</h5>
            {debugStarredData.staleUnsyncedThreads?.length ? (
              <ul>
                {debugStarredData.staleUnsyncedThreads.map((thread) => (
                  <li key={thread.threadId}>
                    {thread.threadId} — {thread.minutesUnsynced} min (archived: {String(thread.isArchived)}, starCount: {thread.starCount})
                  </li>
                ))}
              </ul>
            ) : (
              <p>No stale unsynced threads found.</p>
            )}

            <button
              onClick={() => setShowSyncPopup(false)}
              style={{
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                backgroundColor: theme.colors.primary.main,
                color: '#fff',
                border: 'none',
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

