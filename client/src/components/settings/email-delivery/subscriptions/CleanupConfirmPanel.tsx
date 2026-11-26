import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { BlockSenderWarning } from 'components/BlockSenderWarning';
import { COLOR_TRANSPARENT } from 'constants/colors';
import { UNSUBSCRIBE_METHODS } from 'constants/unsubscribe';

import { MailingList } from './mailingLists.api';

interface CleanupConfirmPanelProps {
  selected: MailingList[];
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Says exactly what "Unsubscribe & archive" will do before it runs. The mailto
 * senders are listed by address, because for those BearlyMail sends an email
 * from the user's own account.
 */
export const CleanupConfirmPanel: React.FC<CleanupConfirmPanelProps> = ({ selected, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  const byMethod = (method: string) => selected.filter(list => list.method === method);
  const oneClick = byMethod(UNSUBSCRIBE_METHODS.ONE_CLICK);
  const mailto = byMethod(UNSUBSCRIBE_METHODS.MAILTO);
  const link = byMethod(UNSUBSCRIBE_METHODS.LINK);

  return (
    <div
      role="alertdialog"
      aria-labelledby="subscriptions-confirm-title"
      style={{
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.md,
        backgroundColor: theme.colors.background.subtle,
      }}
    >
      <h4 id="subscriptions-confirm-title" style={{ margin: `0 0 ${theme.spacing.sm}`, color: theme.colors.text.primary }}>
        {t('settings.subscriptions.confirm.title', { count: selected.length })}
      </h4>
      <ul style={{ margin: `0 0 ${theme.spacing.sm}`, paddingLeft: theme.spacing.lg, color: theme.colors.text.primary }}>
        {oneClick.length > 0 && <li>{t('settings.subscriptions.confirm.oneClick', { count: oneClick.length })}</li>}
        {mailto.length > 0 && (
          <li>
            {t('settings.subscriptions.confirm.mailto', { count: mailto.length })}
            <ul style={{ paddingLeft: theme.spacing.md, color: theme.colors.text.secondary }}>
              {mailto.map(list => (
                <li key={list.emailId} style={{ overflowWrap: 'anywhere' }}>
                  {list.name ? `${list.name} (${list.address})` : list.address}
                </li>
              ))}
            </ul>
          </li>
        )}
        {link.length > 0 && <li>{t('settings.subscriptions.confirm.link', { count: link.length })}</li>}
      </ul>
      <p style={{ margin: 0, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
        {t('settings.subscriptions.confirm.archiveNote')}
      </p>
      <BlockSenderWarning
        title={t('settings.subscriptions.confirm.blockWarningTitle', { count: selected.length })}
        detail={t('settings.subscriptions.confirm.blockWarningDetail')}
      />
      <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onConfirm}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: theme.colors.primary.main,
            color: theme.colors.text.primary,
            border: 'none',
            borderRadius: theme.borderRadius.md,
            fontWeight: theme.typography.fontWeight.semibold,
            cursor: 'pointer',
          }}
        >
          {t('settings.subscriptions.confirm.confirm')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.primary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
          }}
        >
          {t('settings.subscriptions.confirm.cancel')}
        </button>
      </div>
    </div>
  );
};
