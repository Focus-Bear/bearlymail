import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

import { GMAIL_SNOOZE_LABEL } from './accountDeletion.helpers';

const noticeStyle: React.CSSProperties = {
  backgroundColor: theme.colors.background.default,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  padding: theme.spacing.lg,
};

const noticeTitleStyle: React.CSSProperties = {
  color: theme.colors.text.primary,
  marginBottom: theme.spacing.sm,
  fontSize: theme.typography.fontSize.base,
  fontWeight: theme.typography.fontWeight.semibold,
};

const noticeBodyStyle: React.CSSProperties = {
  color: theme.colors.text.primary,
  marginBottom: theme.spacing.md,
  fontSize: theme.typography.fontSize.sm,
};

const doneButtonStyle: React.CSSProperties = {
  backgroundColor: theme.colors.primary.main,
  color: COLOR_NAMED_WHITE,
  border: STRING_NONE,
  borderRadius: theme.borderRadius.md,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  fontSize: theme.typography.fontSize.base,
  fontWeight: theme.typography.fontWeight.medium,
  cursor: 'pointer',
};

interface SnoozedThreadsLeftNoticeProps {
  /** Snoozed threads the deletion could not put back in the inbox. */
  count: number;
  onDone: () => void;
}

/**
 * Shown after an account deletion that could not move every snoozed thread back
 * to the inbox (e.g. the Gmail sign-in had expired), so the user knows where
 * that mail is before they are signed out.
 */
export const SnoozedThreadsLeftNotice: React.FC<SnoozedThreadsLeftNoticeProps> = ({ count, onDone }) => {
  const { t } = useTranslation();
  return (
    <div role="alert" style={noticeStyle} data-testid="account-deletion-still-snoozed">
      <p style={noticeTitleStyle}>{t('settings.accountDeletion.stillSnoozedTitle')}</p>
      <p style={noticeBodyStyle}>{t('settings.accountDeletion.stillSnoozed', { count, label: GMAIL_SNOOZE_LABEL })}</p>
      <button type="button" onClick={onDone} style={doneButtonStyle}>
        {t('settings.accountDeletion.stillSnoozedDone')}
      </button>
    </div>
  );
};
