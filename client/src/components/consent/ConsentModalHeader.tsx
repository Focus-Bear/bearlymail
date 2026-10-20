import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface ConsentModalHeaderProps {
  /** i18n keys of the policy changes since the last acceptance; empty for first-time acceptance. */
  changeSummaryKeys?: string[];
}

const ChangeSummary: React.FC<{ summaryKeys: string[] }> = ({ summaryKeys }) => {
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
      {summaryKeys.map(summaryKey => (
        <p key={summaryKey} style={{ marginTop: theme.spacing.xs, color: theme.colors.text.secondary }}>
          {t(summaryKey)}
        </p>
      ))}
    </div>
  );
};

/**
 * Consent modal header: a welcome for first-time acceptance, or an update
 * notice with what changed when an earlier policy was accepted.
 */
export const ConsentModalHeader: React.FC<ConsentModalHeaderProps> = ({ changeSummaryKeys = [] }) => {
  const { t } = useTranslation();
  const isPolicyUpdate = changeSummaryKeys.length > 0;

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
        {isPolicyUpdate ? t('consent.updatedTitle') : t('consent.welcome')}
      </h2>

      <p
        style={{
          marginBottom: theme.spacing.lg,
          color: theme.colors.text.secondary,
          lineHeight: theme.typography.lineHeight.relaxed,
        }}
      >
        {isPolicyUpdate ? t('consent.updatedDescription') : t('consent.description')}
      </p>

      {isPolicyUpdate && <ChangeSummary summaryKeys={changeSummaryKeys} />}
    </>
  );
};
