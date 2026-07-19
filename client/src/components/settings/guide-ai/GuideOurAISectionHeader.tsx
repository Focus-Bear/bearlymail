import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { INPUT_WIDTH_PX } from 'constants/numbers';

export const GuideOurAISectionHeader: React.FC = () => {
  const { t } = useTranslation();

  return (
    <>
      <h2
        style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.xl,
          scrollMarginTop: `${INPUT_WIDTH_PX}px`,
        }}
      >
        {t('settings.guideAI.title')}
      </h2>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.lg,
          fontSize: theme.typography.fontSize.base,
        }}
      >
        {t('settings.guideAI.description')}
      </p>
    </>
  );
};
