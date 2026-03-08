import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface StarDiscrepancyHeaderProps {
  predictedStarCount: number;
  userStarCount: number;
}

export const StarDiscrepancyHeader: React.FC<StarDiscrepancyHeaderProps> = ({ predictedStarCount, userStarCount }) => {
  const { t } = useTranslation();

  const getStarText = (count: number): string => {
    if (count === 0) {
      return t('priority.star.notStarred');
    }
    return t('priority.star.starCount', { count });
  };

  return (
    <>
      <h3
        style={{
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.md,
        }}
      >
        {t('priority.star.helpUsLearn')}
      </h3>

      <p
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
          lineHeight: theme.typography.lineHeight.relaxed,
        }}
      >
        {t('priority.star.prediction', {
          predicted: getStarText(predictedStarCount),
          actual: userStarCount === 0 ? t('priority.star.noStars') : getStarText(userStarCount),
        })}
      </p>

      <p
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {t(userStarCount > predictedStarCount ? 'priority.star.whyPrioritize' : 'priority.star.whyDeprioritize')}
      </p>
    </>
  );
};
