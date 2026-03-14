/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { theme } from 'theme/theme';

import { COLOR_NAMED_RED } from 'constants/colors';

import { AccordionGroup } from './AccordionGroup';

interface StarredThread {
  threadId: string;
  subject: string | null;
  inDb: boolean;
  isStarredInDb: boolean;
  category: string | null;
  appearsInActionOrFollowUp: boolean;
  reason: string;
  isArchivedInDb?: boolean;
  isInGmailInbox?: boolean;
  syncStatus?: 'synced' | 'unsynced';
  hasUnsyncedChanges?: boolean;
  archiveStatusConflict?: boolean;
}

interface StarredThreadsListProps {
  threads: StarredThread[];
}

interface ThreadRowProps {
  thread: StarredThread;
}

const ThreadRow: React.FC<ThreadRowProps> = ({ thread }) => (
  <div
    style={{
      padding: theme.spacing.sm,
      border: `1px solid ${theme.colors.border.light}`,
      borderRadius: theme.borderRadius.sm,
      marginBottom: theme.spacing.xs,
      backgroundColor: theme.colors.background.paper,
      fontSize: theme.typography.fontSize.xs,
    }}
  >
    <div style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap' }}>
      <span>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <strong>Thread:</strong> {thread.threadId}
      </span>
      <span>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <strong>Starred in DB:</strong> {thread.isStarredInDb ? '⭐' : '—'}
      </span>
      <span>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <strong>Action/FollowUp:</strong> {thread.appearsInActionOrFollowUp ? '✅' : '—'}
      </span>
      {thread.syncStatus && (
        <span>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <strong>Sync:</strong> {thread.syncStatus}
        </span>
      )}
      {thread.category && (
        <span>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <strong>Category:</strong> {thread.category}
        </span>
      )}
    </div>
    {thread.subject && (
      <div
        style={{
          fontSize: '0.65rem',
          color: theme.colors.text.secondary,
          marginTop: '2px',
        }}
      >
        {thread.subject}
      </div>
    )}
    {thread.archiveStatusConflict && (
      <div style={{ color: '#d32f2f', fontWeight: 'bold', marginTop: '4px' }}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        ⚠️ Archive conflict: Gmail says INBOX but BearlyMail has archived (syncStatus=synced)
      </div>
    )}
    {thread.hasUnsyncedChanges && !thread.archiveStatusConflict && (
      <div style={{ color: '#f57c00', marginTop: '4px' }}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        🔄 Unsynced change pending
      </div>
    )}
    <div style={{ color: COLOR_NAMED_RED, marginTop: '4px' }}>
      {thread.reason}
    </div>
  </div>
);

export const StarredThreadsList: React.FC<StarredThreadsListProps> = ({ threads = [] }) => {
  const inAction = threads.filter(
    (thread) => thread.inDb && thread.isStarredInDb && thread.appearsInActionOrFollowUp,
  );
  // Note: this catches ALL starred-but-not-in-action, non-archived threads (including
  // edge cases like blocked-sender threads). For a debug view this is acceptable; a
  // production filter would also check !isSnoozed and !isBatched to isolate true
  // follow-up candidates.
  const inFollowUp = threads.filter(
    (thread) =>
      thread.inDb &&
      thread.isStarredInDb &&
      !thread.appearsInActionOrFollowUp &&
      !thread.isArchivedInDb,
  );
  const archived = threads.filter((thread) => thread.inDb && thread.isArchivedInDb);
  const missing = threads.filter((thread) => !thread.inDb);

  return (
    <div>
      <AccordionGroup title="In Action" count={inAction.length} headerColor="#D4EDDA">
        {inAction.length === 0 ? (
          <p style={{ margin: `${theme.spacing.xs} 0`, color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.xs }}>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            No threads in action.
          </p>
        ) : (
          inAction.map((thread) => <ThreadRow key={thread.threadId} thread={thread} />)
        )}
      </AccordionGroup>

      <AccordionGroup title="In Follow Up" count={inFollowUp.length} headerColor="#E6F0FF">
        {inFollowUp.length === 0 ? (
          <p style={{ margin: `${theme.spacing.xs} 0`, color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.xs }}>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            No threads in follow up.
          </p>
        ) : (
          inFollowUp.map((thread) => <ThreadRow key={thread.threadId} thread={thread} />)
        )}
      </AccordionGroup>

      <AccordionGroup title="Archived in BearlyMail" count={archived.length} headerColor="#FFF3CD">
        {archived.length === 0 ? (
          <p style={{ margin: `${theme.spacing.xs} 0`, color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.xs }}>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            No archived threads.
          </p>
        ) : (
          archived.map((thread) => <ThreadRow key={thread.threadId} thread={thread} />)
        )}
      </AccordionGroup>

      <AccordionGroup title="Missing in BearlyMail" count={missing.length} headerColor="#FFE6E6">
        {missing.length === 0 ? (
          <p style={{ margin: `${theme.spacing.xs} 0`, color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.xs }}>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            No missing threads.
          </p>
        ) : (
          missing.map((thread) => <ThreadRow key={thread.threadId} thread={thread} />)
        )}
      </AccordionGroup>
    </div>
  );
};
