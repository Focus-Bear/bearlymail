import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_INFO_BLUE_LIGHT, COLOR_NAMED_RED } from 'constants/colors';
import { EMOJI_DATABASE, EMOJI_EMAIL } from 'constants/emojis';

interface StarredComparisonGridProps {
  gmail: {
    starredThreadCount: number;
    starredEmailCount: number;
    error?: string;
  };
  database: {
    starredThreadCount: number;
    starredEmailCount: number;
  };
}

export const StarredComparisonGrid: React.FC<StarredComparisonGridProps> = ({ gmail, database }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.md,
      }}
    >
      <div
        style={{
          padding: theme.spacing.sm,
          backgroundColor: COLOR_INFO_BLUE_LIGHT,
          borderRadius: theme.borderRadius.sm,
        }}
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <h5 style={{ margin: `0 0 ${theme.spacing.xs} 0` }}>
          {EMOJI_EMAIL} {t('debug.starred.gmailTitle')}
        </h5>
        {gmail.error ? (
          <div style={{ color: COLOR_NAMED_RED }}>
            {t('common.error')}: {gmail.error}
          </div>
        ) : (
          <>
            <div>
              <strong>{gmail.starredThreadCount}</strong> {t('debug.starred.starredThreads')}
            </div>
            <div>
              <strong>{gmail.starredEmailCount}</strong> {t('debug.starred.starredEmails')}
            </div>
          </>
        )}
      </div>
      <div
        style={{
          padding: theme.spacing.sm,
          backgroundColor: COLOR_INFO_BLUE_LIGHT,
          borderRadius: theme.borderRadius.sm,
        }}
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <h5 style={{ margin: `0 0 ${theme.spacing.xs} 0` }}>
          {EMOJI_DATABASE} {t('debug.starred.database')}
        </h5>
        <div>
          <strong>{database.starredThreadCount}</strong> {t('debug.starred.starredThreads')}
        </div>
        <div>
          <strong>{database.starredEmailCount}</strong> {t('debug.starred.starredEmails')}
        </div>
      </div>
    </div>
  );
};
