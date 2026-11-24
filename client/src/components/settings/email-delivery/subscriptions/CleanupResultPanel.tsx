import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { NEW_TAB_TARGET } from 'constants/unsubscribe';

import { CleanupResult } from './useMailingListCleanup';

const NO_OPENER_REL = 'noopener noreferrer';

interface CleanupResultPanelProps {
  result: CleanupResult;
  onDismiss: () => void;
}

const labelOf = (list: { name: string | null; address: string }) => list.name || list.address;

/** What the cleanup did, the websites the user still has to finish on, and anything that failed. */
export const CleanupResultPanel: React.FC<CleanupResultPanelProps> = ({ result, onDismiss }) => {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      style={{
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.md,
        backgroundColor: theme.colors.background.subtle,
        color: theme.colors.text.primary,
      }}
    >
      {result.unsubscribed.length > 0 && (
        <p style={{ margin: `0 0 ${theme.spacing.xs}` }}>
          {t('settings.subscriptions.result.unsubscribed', { count: result.unsubscribed.length })}
        </p>
      )}
      <p style={{ margin: `0 0 ${theme.spacing.sm}` }}>
        {t('settings.subscriptions.result.archived', { count: result.archivedThreads })}
      </p>

      {result.toFinish.length > 0 && (
        <>
          <p style={{ margin: `0 0 ${theme.spacing.xs}`, fontWeight: theme.typography.fontWeight.semibold }}>
            {t('settings.subscriptions.result.finishOnWebsite')}
          </p>
          <ul style={{ margin: `0 0 ${theme.spacing.sm}`, paddingLeft: theme.spacing.lg }}>
            {result.toFinish.map(({ list, url }) => (
              <li key={list.emailId} style={{ overflowWrap: 'anywhere' }}>
                <a href={url} target={NEW_TAB_TARGET} rel={NO_OPENER_REL} style={{ color: theme.colors.primary.main }}>
                  {t('settings.subscriptions.result.openPage', { sender: labelOf(list) })}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {result.failed.length > 0 && (
        <>
          <p style={{ margin: `0 0 ${theme.spacing.xs}`, color: theme.colors.error.dark }}>
            {t('settings.subscriptions.result.failed')}
          </p>
          <ul style={{ margin: `0 0 ${theme.spacing.sm}`, paddingLeft: theme.spacing.lg }}>
            {result.failed.map(list => (
              <li key={list.emailId} style={{ overflowWrap: 'anywhere' }}>
                {labelOf(list)}
              </li>
            ))}
          </ul>
        </>
      )}

      <button
        type="button"
        onClick={onDismiss}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.primary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          cursor: 'pointer',
        }}
      >
        {t('settings.subscriptions.result.dismiss')}
      </button>
    </div>
  );
};
