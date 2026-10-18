import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface ConsentModalHeaderProps {
  /** i18n key of the policy change summary; absent for first-time acceptance. */
  changeSummaryKey?: string | null;
}

const ChangeSummary: React.FC<{ summaryKey: string }> = ({ summaryKey }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        marginBottom: theme.spacing.lg,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.background.default,
      }}
    >
      <strong style={{ color: theme.colors.text.primary }}>{t('consent.whatsChanged')}</strong>
      <p style={{ marginTop: theme.spacing.xs, color: theme.colors.text.secondary }}>{t(summaryKey)}</p>
    </div>
  );
};

/**
 * Consent modal header: a welcome for first-time acceptance, or an update
 * notice with what changed when an earlier policy was accepted.
 */
export const ConsentModalHeader: React.FC<ConsentModalHeaderProps> = ({ changeSummaryKey }) => {
  const { t } = useTranslation();

  return (
    <>
      <h2
        style={{
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          marginBottom: theme.spacing.lg,
          color: theme.colors.text.primary,
        }}
      >
        {changeSummaryKey ? t('consent.updatedTitle') : t('consent.welcome')}
      </h2>

      <p
        style={{
          marginBottom: theme.spacing.lg,
          color: theme.colors.text.secondary,
          lineHeight: theme.typography.lineHeight.relaxed,
        }}
      >
        {changeSummaryKey ? t('consent.updatedDescription') : t('consent.description')}
      </p>

      {changeSummaryKey && <ChangeSummary summaryKey={changeSummaryKey} />}
    </>
  );
};
