import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_WHITE_FULL } from 'constants/colors';
import { useBacklogProgress } from 'hooks/useBacklogProgress';

/**
 * Shown at the top of the inbox when there are AI-deferred threads to process
 * after the user returns from inactivity.
 */
export const CatchingUpBanner: React.FC = () => {
  const { t } = useTranslation();
  const { data: progress } = useBacklogProgress();

  if (!progress?.isProcessing) {
    return null;
  }

  return (
    <div
      title={t('inbox.catchingUpTooltip')}
      style={{
        backgroundColor: theme.colors.accent.info,
        color: COLOR_WHITE_FULL,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        textAlign: 'center',
        fontWeight: theme.typography.fontWeight.medium,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        fontSize: theme.typography.fontSize.sm,
      }}
    >
      <span
        className="animate-spin"
        style={{
          display: 'inline-block',
          width: '1em',
          height: '1em',
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.4)',
          borderTopColor: '#ffffff',
          animation: 'spin 0.8s linear infinite',
        }}
        aria-hidden="true"
      />
      <span>{t('inbox.catchingUp', { remaining: progress.remaining })}</span>
    </div>
  );
};
