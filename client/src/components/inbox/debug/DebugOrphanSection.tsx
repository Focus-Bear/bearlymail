import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { OrphanStatsGrid } from 'components/inbox/debug/OrphanStatsGrid';
import { OrphanEmailList } from 'components/inbox/debug/OrphanEmailList';
import { ThreadsWithoutEmailsList } from 'components/inbox/debug/ThreadsWithoutEmailsList';
import { EMOJI_LINK } from 'constants/emojis';

interface DebugOrphanData {
  totalEmailsInDb: number;
  emailsWithThreadId: number;
  orphanEmails: number;
  orphanEmailDetails: Array<{
    id: string;
    threadId: string;
    emailThreadId: string | null;
    subject: string;
    from: string;
    receivedAt: string;
  }>;
  threadsInDb: number;
  threadsWithoutEmails: Array<{
    id: string;
    threadId: string;
    starCount: number;
    isArchived: boolean;
  }>;
}

interface DebugOrphanSectionProps {
  debugOrphanData: DebugOrphanData | null;
  loadingOrphanData: boolean;
  onFetchDebugOrphan: () => void;
  fixingOrphans: boolean;
  onFixOrphans: () => void;
}

/**
 * Debug orphan section component
 * Displays orphan emails debug information
 */
export const DebugOrphanSection: React.FC<DebugOrphanSectionProps> = ({
  debugOrphanData,
  loadingOrphanData,
  onFetchDebugOrphan,
  fixingOrphans,
  onFixOrphans,
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
        <h4 style={{ margin: 0 }}>{EMOJI_LINK} {t('debug.orphan.sectionTitle')}</h4>
        <button
          onClick={onFetchDebugOrphan}
          disabled={loadingOrphanData}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            backgroundColor: theme.colors.primary.main,
            color: 'white',
            border: 'none',
            borderRadius: theme.borderRadius.sm,
            cursor: loadingOrphanData ? 'not-allowed' : 'pointer',
            opacity: loadingOrphanData ? OPACITY_DISABLED : OPACITY_FULL,
          }}
        >
          {loadingOrphanData ? t('common.loading') : t('debug.orphan.fetchButton')}
        </button>
      </div>

      {debugOrphanData && (
        <div>
          <OrphanStatsGrid
            totalEmailsInDb={debugOrphanData.totalEmailsInDb}
            emailsWithThreadId={debugOrphanData.emailsWithThreadId}
            orphanEmails={debugOrphanData.orphanEmails}
            threadsInDb={debugOrphanData.threadsInDb}
          />
          <OrphanEmailList
            orphanEmails={debugOrphanData.orphanEmailDetails}
            onFixOrphans={onFixOrphans}
            fixingOrphans={fixingOrphans}
          />
          <ThreadsWithoutEmailsList threads={debugOrphanData.threadsWithoutEmails} />
        </div>
      )}
    </div>
  );
};



