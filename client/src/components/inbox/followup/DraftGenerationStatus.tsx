import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { DRAFT_STATUS_ERROR, DRAFT_STATUS_GENERATING } from 'constants/strings';

interface DraftGenerationStatusProps {
  generationStatus: 'pending' | 'generating' | 'completed' | 'error' | null;
  generationError: string | null;
}

export const DraftGenerationStatus: React.FC<DraftGenerationStatusProps> = ({ generationStatus, generationError }) => {
  const { t } = useTranslation();

  if (generationStatus === DRAFT_STATUS_GENERATING) {
    return (
      <div
        style={{
          padding: theme.spacing.sm,
          textAlign: 'center',
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('inbox.generatingDraft')}
      </div>
    );
  }

  if (generationStatus === DRAFT_STATUS_ERROR) {
    return (
      <div
        style={{
          padding: theme.spacing.sm,
          backgroundColor: theme.colors.error.light,
          color: theme.colors.error.main,
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.sm,
          marginBottom: theme.spacing.sm,
        }}
      >
        {t('common.error')}: {generationError || t('inbox.failedToGenerateDraft')}
      </div>
    );
  }

  return null;
};
