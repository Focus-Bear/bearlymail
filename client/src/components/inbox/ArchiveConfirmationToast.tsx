import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface ArchiveConfirmationToastProps {
  emailCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const kbdStyle = {
  padding: `0 ${theme.spacing.xs}`,
  borderRadius: '3px',
  fontSize: theme.typography.fontSize.xs,
} as const;
const btnBaseStyle = {
  borderRadius: theme.borderRadius.sm,
  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.medium,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.xs,
} as const;

export const ArchiveConfirmationToast: React.FC<ArchiveConfirmationToastProps> = ({
  emailCount,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: theme.spacing['2xl'],
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: theme.colors.background.paper,
        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.xl,
        border: `1px solid ${theme.colors.border.medium}`,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.md,
        animation: 'slideUp 0.2s ease-out',
      }}
    >
      <div
        style={{
          color: theme.colors.text.primary,
          fontWeight: theme.typography.fontWeight.medium,
          fontSize: theme.typography.fontSize.base,
        }}
      >
        {emailCount === 1
          ? t('keyboard.archiveConfirmSingle')
          : t('keyboard.archiveConfirmMultiple', { count: emailCount })}
      </div>
      <div
        style={{
          display: 'flex',
          gap: theme.spacing.sm,
          alignItems: 'center',
        }}
      >
        <button
          onClick={onConfirm}
          style={{
            ...btnBaseStyle,
            backgroundColor: theme.colors.accent.error,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
          }}
        >
          <kbd style={{ ...kbdStyle, backgroundColor: 'rgba(255,255,255,0.2)' }}>{t('keyboard.keyY')}</kbd>
          {t('keyboard.yes')}
        </button>
        <button
          onClick={onCancel}
          style={{
            ...btnBaseStyle,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
          }}
        >
          <kbd style={{ ...kbdStyle, backgroundColor: theme.colors.background.disabled }}>{t('keyboard.keyEsc')}</kbd>
          {t('keyboard.no')}
        </button>
      </div>
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
