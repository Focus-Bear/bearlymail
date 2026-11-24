import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { UNSUBSCRIBE_METHODS, UnsubscribeMethod } from 'constants/unsubscribe';

import { MailingList } from './mailingLists.api';

/** How each method is named on the list, so the user sees what will happen before ticking. */
export const METHOD_LABEL_KEYS: Record<UnsubscribeMethod, string> = {
  [UNSUBSCRIBE_METHODS.ONE_CLICK]: 'settings.subscriptions.method.oneClick',
  [UNSUBSCRIBE_METHODS.MAILTO]: 'settings.subscriptions.method.mailto',
  [UNSUBSCRIBE_METHODS.LINK]: 'settings.subscriptions.method.link',
};

const METHOD_HINT_KEYS: Record<UnsubscribeMethod, string> = {
  [UNSUBSCRIBE_METHODS.ONE_CLICK]: 'settings.subscriptions.methodHint.oneClick',
  [UNSUBSCRIBE_METHODS.MAILTO]: 'settings.subscriptions.methodHint.mailto',
  [UNSUBSCRIBE_METHODS.LINK]: 'settings.subscriptions.methodHint.link',
};

interface MailingListRowProps {
  list: MailingList;
  isSelected: boolean;
  isDisabled: boolean;
  onToggle: (emailId: string) => void;
}

/** One mailing list: a checkbox with the sender, how much they send, and how unsubscribing works. */
export const MailingListRow: React.FC<MailingListRowProps> = ({ list, isSelected, isDisabled, onToggle }) => {
  const { t } = useTranslation();
  const checkboxId = `mailing-list-${list.emailId}`;
  const displayName = list.name || list.address;

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: theme.spacing.sm,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        borderBottom: `1px solid ${theme.colors.border.light}`,
        backgroundColor: isSelected ? theme.colors.background.subtle : COLOR_TRANSPARENT,
      }}
    >
      <input
        id={checkboxId}
        type="checkbox"
        checked={isSelected}
        disabled={isDisabled}
        onChange={() => onToggle(list.emailId)}
        style={{ marginTop: '3px', width: '16px', height: '16px', flexShrink: 0 }}
      />
      <label htmlFor={checkboxId} style={{ flex: 1, minWidth: 0, cursor: isDisabled ? 'default' : 'pointer' }}>
        <span
          style={{
            display: 'block',
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
            overflowWrap: 'anywhere',
          }}
        >
          {displayName}
        </span>
        {list.name && (
          <span
            style={{
              display: 'block',
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
              overflowWrap: 'anywhere',
            }}
          >
            {list.address}
          </span>
        )}
        <span style={{ display: 'block', fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
          {t('settings.subscriptions.stats', { count: list.emailCount, perWeek: list.perWeek })}
          {list.triageThreadCount > 0 && ` · ${t('settings.subscriptions.inTriage', { count: list.triageThreadCount })}`}
        </span>
      </label>
      <span
        title={t(METHOD_HINT_KEYS[list.method])}
        style={{
          flexShrink: 0,
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.full,
          padding: `2px ${theme.spacing.sm}`,
          whiteSpace: 'nowrap',
        }}
      >
        {t(METHOD_LABEL_KEYS[list.method])}
      </span>
    </li>
  );
};
