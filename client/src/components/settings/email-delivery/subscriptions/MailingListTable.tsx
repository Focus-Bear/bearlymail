import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { MailingListRow } from './MailingListRow';
import { MailingList } from './mailingLists.api';

interface MailingListTableProps {
  lists: MailingList[];
  selectedIds: Set<string>;
  selectedCount: number;
  isBusy: boolean;
  isConfirming: boolean;
  onToggle: (emailId: string) => void;
  onToggleAll: () => void;
  onCleanUp: () => void;
}

/** The mailing lists with a select-all box and the "Unsubscribe & archive" button. */
export const MailingListTable: React.FC<MailingListTableProps> = ({
  lists,
  selectedIds,
  selectedCount,
  isBusy,
  isConfirming,
  onToggle,
  onToggleAll,
  onCleanUp,
}) => {
  const { t } = useTranslation();
  const hasSelection = selectedCount > 0;

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: theme.spacing.sm,
          flexWrap: 'wrap',
          marginBottom: theme.spacing.sm,
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, cursor: 'pointer' }}>
          <input type="checkbox" checked={selectedCount === lists.length} disabled={isBusy} onChange={onToggleAll} />
          {t('settings.subscriptions.selectAll', { count: lists.length })}
        </label>
        <button
          type="button"
          onClick={onCleanUp}
          disabled={!hasSelection || isBusy || isConfirming}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: hasSelection ? theme.colors.primary.main : theme.colors.greyscale[300],
            color: hasSelection ? theme.colors.text.primary : theme.colors.text.secondary,
            border: 'none',
            borderRadius: theme.borderRadius.md,
            fontWeight: theme.typography.fontWeight.semibold,
            cursor: hasSelection ? 'pointer' : 'default',
          }}
        >
          {t('settings.subscriptions.cleanupButton', { count: selectedCount })}
        </button>
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.md,
        }}
      >
        {lists.map(list => (
          <MailingListRow
            key={list.emailId}
            list={list}
            isSelected={selectedIds.has(list.emailId)}
            isDisabled={isBusy}
            onToggle={onToggle}
          />
        ))}
      </ul>
      <p
        style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          margin: `${theme.spacing.sm} 0 0`,
        }}
      >
        {t('settings.subscriptions.newMailNote')}
      </p>
    </>
  );
};
