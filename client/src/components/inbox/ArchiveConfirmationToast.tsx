import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface ArchiveConfirmationToastProps {
  emailCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ArchiveConfirmationToast: React.FC<ArchiveConfirmationToastProps> = ({
  emailCount,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{
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
    }}>
      <div style={{ 
        color: theme.colors.text.primary, 
        fontWeight: theme.typography.fontWeight.medium,
        fontSize: theme.typography.fontSize.base,
      }}>
        {emailCount === 1 
          ? t('keyboard.archiveConfirmSingle')
          : t('keyboard.archiveConfirmMultiple', { count: emailCount })
        }
      </div>
      <div style={{
        display: 'flex',
        gap: theme.spacing.sm,
        alignItems: 'center',
      }}>
        <button
          onClick={onConfirm}
          style={{
            backgroundColor: theme.colors.accent.error,
            color: '#fff',
            border: 'none',
            borderRadius: theme.borderRadius.sm,
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}
        >
          <kbd style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            padding: `0 ${theme.spacing.xs}`,
            borderRadius: '3px',
            fontSize: theme.typography.fontSize.xs,
          }}>{t('keyboard.keyY')}</kbd>
          {t('keyboard.yes')}
        </button>
        <button
          onClick={onCancel}
          style={{
            backgroundColor: 'transparent',
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.sm,
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}
        >
          <kbd style={{
            backgroundColor: theme.colors.background.disabled,
            padding: `0 ${theme.spacing.xs}`,
            borderRadius: '3px',
            fontSize: theme.typography.fontSize.xs,
          }}>{t('keyboard.keyEsc')}</kbd>
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
