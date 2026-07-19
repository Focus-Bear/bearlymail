import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { STRING_NONE } from 'constants/strings';

interface ProtoCategoriesModalHeaderProps {
  onClose: () => void;
}

export const ProtoCategoriesModalHeader: React.FC<ProtoCategoriesModalHeaderProps> = ({ onClose }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: theme.spacing.md,
      }}
    >
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
          }}
        >
          {t('settings.protoCategories.title')}
        </h3>
        <p
          style={{
            margin: `${theme.spacing.xs} 0 0 0`,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}
        >
          {t('settings.protoCategories.description')}
        </p>
      </div>
      <button
        onClick={onClose}
        style={{
          background: STRING_NONE,
          border: STRING_NONE,
          fontSize: '20px',
          color: theme.colors.text.secondary,
          cursor: 'pointer',
          padding: '0',
          marginLeft: theme.spacing.md,
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-label={t('common.close')}
      >
        ×
      </button>
    </div>
  );
};
