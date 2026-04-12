import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_INFO_BLUE_LIGHT, COLOR_NAMED_RED } from 'constants/colors';
import { EMOJI_DATABASE, EMOJI_EMAIL } from 'constants/emojis';

interface StarredComparisonGridProps {
  summary: {
    gmailStarredCount: number;
    foundInDb: number;
    notInDb: number;
    inActionOrFollowUp: number;
    starredInDbButHidden: number;
    notStarredInDb: number;
  };
  gmailError?: string;
}

export const StarredComparisonGrid: React.FC<StarredComparisonGridProps> = ({ summary, gmailError }) => {
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
        <h5 style={{ margin: `0 0 ${theme.spacing.xs} 0` }}>
          {EMOJI_EMAIL} {t('debug.starred.gmailTitle')}
        </h5>
        {gmailError ? (
          <div style={{ color: COLOR_NAMED_RED }}>
            {t('common.error')}: {gmailError}
          </div>
        ) : (
          <div>
            <strong>{summary.gmailStarredCount}</strong> {t('debug.starred.starredThreads')}
          </div>
        )}
      </div>
      <div
        style={{
          padding: theme.spacing.sm,
          backgroundColor: COLOR_INFO_BLUE_LIGHT,
          borderRadius: theme.borderRadius.sm,
        }}
      >
        <h5 style={{ margin: `0 0 ${theme.spacing.xs} 0` }}>
          {EMOJI_DATABASE} {t('debug.starred.database')}
        </h5>
        <div>
          <strong>{summary.foundInDb}</strong> {t('debug.starred.foundInDb')}
        </div>
        <div>
          <strong style={{ color: summary.notInDb > 0 ? 'red' : 'green' }}>{summary.notInDb}</strong>{' '}
          {t('debug.starred.notInDb')}
        </div>
        <div>
          <strong>{summary.inActionOrFollowUp}</strong> {t('debug.starred.inActionOrFollowUp')}
        </div>
        <div>
          <strong style={{ color: summary.starredInDbButHidden > 0 ? 'orange' : 'green' }}>
            {summary.starredInDbButHidden}
          </strong>{' '}
          {t('debug.starred.starredInDbButHidden')}
        </div>
        <div>
          <strong style={{ color: summary.notStarredInDb > 0 ? 'orange' : 'green' }}>{summary.notStarredInDb}</strong>{' '}
          {t('debug.starred.notStarredInDb')}
        </div>
      </div>
    </div>
  );
};
