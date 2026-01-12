import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { StarredComparisonGrid } from 'components/inbox/debug/StarredComparisonGrid';
import { ComparisonResultsGrid } from 'components/inbox/debug/ComparisonResultsGrid';
import { MissingFromProcessTabList } from 'components/inbox/debug/MissingFromProcessTabList';
import { StarredThreadsList } from 'components/inbox/debug/StarredThreadsList';
import { EMOJI_SEARCH } from 'constants/emojis';

interface DebugStarredData {
  lastSyncTime: string | null;
  gmail: {
    starredThreadCount: number;
    starredThreadIds: string[];
    error?: string;
  };
  database: {
    starredThreadCount: number;
    starredEmailCount: number;
  };
  actionTabResults: number;
  comparison: {
    inGmailNotInDb: string[];
    inDbNotInGmail: string[];
    inDbButArchived: string[];
  };
  starredThreads: Array<{
    threadId: string;
    starCount: number;
    isArchived: boolean;
    isSnoozed: boolean;
    emailCount: number;
    latestSubject: string;
    latestFrom: string;
    issues: string[];
    inGmail: boolean;
    lastCheckedAt?: string | null;
  }>;
  missingFromProcessTab: Array<{
    threadId: string;
    reason: string;
    details: any;
  }>;
}

interface DebugStarredSectionProps {
  debugStarredData: DebugStarredData | null;
  loadingDebugData: boolean;
  onFetchDebugStarred: () => void;
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
          onClick={onFetchDebugStarred}
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
          {loadingDebugData ? t('common.loading') : t('debug.starred.fetchButton')}
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
    </div>
  );
};

