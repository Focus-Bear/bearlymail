import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface ScanModalProps {
  onStartScan: () => void;
  onDismissScan: () => void;
}

/**
 * Scan permission modal component
 */
export const ScanModal: React.FC<ScanModalProps> = ({ onStartScan, onDismissScan }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.colors.overlay.dark,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing['2xl'],
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.xl,
          maxWidth: '500px',
          textAlign: 'center',
        }}
      >
        <h2 style={{ marginBottom: theme.spacing.md, color: theme.colors.text.primary }}>
          {t('onboarding.scan.title')}
        </h2>
        <p
          style={{
            marginBottom: theme.spacing.xl,
            color: theme.colors.text.secondary,
            lineHeight: 1.6,
          }}
        >
          {t('onboarding.scan.content')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          <button
            onClick={onStartScan}
            style={{
              padding: theme.spacing.lg,
              backgroundColor: theme.colors.primary.main,
              color: COLOR_NAMED_WHITE,
              border: STRING_NONE,
              borderRadius: theme.borderRadius.md,
              fontWeight: theme.typography.fontWeight.semibold,
              cursor: 'pointer',
            }}
          >
            {t('onboarding.scan.startScan')}
          </button>
          <button
            onClick={onDismissScan}
            style={{
              padding: theme.spacing.md,
              backgroundColor: COLOR_TRANSPARENT,
              color: theme.colors.text.secondary,
              border: STRING_NONE,
              cursor: 'pointer',
            }}
          >
            {t('onboarding.scan.skip')}
          </button>
        </div>
      </div>
    </div>
  );
};
