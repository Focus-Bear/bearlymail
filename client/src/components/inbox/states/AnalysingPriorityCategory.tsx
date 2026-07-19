import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

// Module-level constant so @keyframes CSS is injected once, not per render
const SPIN_KEYFRAMES_STYLE = `
  @keyframes analysing-priority-spin {
    to { transform: rotate(360deg); }
  }
`;

// Inject keyframes once at module load time (SSR-safe: only runs in browser)
if (typeof document !== 'undefined') {
  const styleId = 'analysing-priority-keyframes';
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = SPIN_KEYFRAMES_STYLE;
    document.head.appendChild(styleEl);
  }
}

interface AnalysingPriorityCategoryProps {
  count: number;
}

/**
 * Virtual category row shown when emails have not yet been prioritised.
 * Appears above the regular category list to indicate analysis is in progress.
 */
export const AnalysingPriorityCategory: React.FC<AnalysingPriorityCategoryProps> = ({ count }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
        marginBottom: theme.spacing.sm,
        opacity: 0.8,
      }}
    >
      {/* Spinner */}
      <span
        role="status"
        aria-label={t('inbox.analysingPriority.label')}
        style={{
          display: 'inline-block',
          width: '14px',
          height: '14px',
          border: `2px solid ${theme.colors.border.medium}`,
          borderTopColor: theme.colors.primary.main,
          borderRadius: '50%',
          animation: 'analysing-priority-spin 1s linear infinite',
          flexShrink: 0,
        }}
      />
      <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, fontStyle: 'italic' }}>
        {t('inbox.analysingPriority.label')}
      </span>
      <span
        style={{
          marginLeft: 'auto',
          backgroundColor: theme.colors.background.default,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.xs,
          padding: `2px ${theme.spacing.xs}`,
          borderRadius: theme.borderRadius.sm,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {count}
      </span>
    </div>
  );
};
