import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { CATEGORY_DANGEROUS_PHISHING } from 'constants/strings';

import { type PhishingConfidence } from './emailPhishingWarning.helpers';

export type { PhishingConfidence } from './emailPhishingWarning.helpers';

interface EmailPhishingWarningProps {
  confidence: PhishingConfidence;
  reason: string;
}
const CONFIDENCE_COLORS: Record<PhishingConfidence, { bg: string; border: string; text: string }> = {
  low: { bg: '#fff8e1', border: '#ffe082', text: '#7c5a00' },
  medium: { bg: '#fff3e0', border: '#ffb74d', text: '#7c3a00' },
  high: { bg: '#fce4ec', border: '#ef9a9a', text: '#7f0000' },
};

const CONFIDENCE_ICONS: Record<PhishingConfidence, string> = {
  low: '⚠️',
  medium: '🚨',
  high: '🛑',
};

/**
 * Visible warning banner for emails flagged as potential phishing.
 * Category label: {@link CATEGORY_DANGEROUS_PHISHING}
 */
export const EmailPhishingWarning: React.FC<EmailPhishingWarningProps> = ({ confidence, reason }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const colors = CONFIDENCE_COLORS[confidence];
  const icon = CONFIDENCE_ICONS[confidence];
  const categoryLabel = CATEGORY_DANGEROUS_PHISHING;

  return (
    <div
      role="alert"
      aria-label={t('phishing.warningAriaLabel')}
      style={{
        backgroundColor: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: theme.borderRadius.md,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        marginBottom: theme.spacing.md,
        color: colors.text,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
          <span role="img" aria-hidden="true" style={{ fontSize: '1.25rem' }}>
            {icon}
          </span>
          <span style={{ fontWeight: theme.typography.fontWeight.semibold }}>
            {t('phishing.warningTitle')} — {categoryLabel}
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: colors.text,
            fontSize: theme.typography.fontSize.sm,
            padding: `0 ${theme.spacing.xs}`,
          }}
        >
          {isExpanded ? t('phishing.hideDetails') : t('phishing.showDetails')}
        </button>
      </div>

      {isExpanded && (
        <div
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          <strong>{t('phishing.confidence')}:</strong> {t(`phishing.confidenceLevel.${confidence}`)} &nbsp;|&nbsp;
          <strong>{t('phishing.reason')}:</strong> {reason}
        </div>
      )}
    </div>
  );
};
