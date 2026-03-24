import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

const SPIN_KEYFRAME_ID = 'analysingPriority-spin-keyframe';

/** Inject the @keyframes spin rule once into the document head (avoids per-render <style> injection). */
function useSpinKeyframe(): void {
  useEffect(() => {
    if (document.getElementById(SPIN_KEYFRAME_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = SPIN_KEYFRAME_ID;
    style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }, []);
}

/** Simple CSS-animated spinner icon */
const SpinnerIcon: React.FC = () => {
  useSpinKeyframe();
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{
        animation: 'spin 1s linear infinite',
        flexShrink: 0,
      }}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="25 10" />
    </svg>
  );
};

interface AnalysingPriorityCategoryProps {
  /** Number of emails that are still being analysed */
  count: number;
}

/**
 * Virtual category row shown at the top of the inbox when there are emails
 * that haven't been prioritised yet (priorityScore IS NULL).
 *
 * Auto-disappears once all emails have been prioritised.
 *
 * Part of: fix #1433 — "Analysing priority..." virtual category
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
        borderRadius: theme.borderRadius.lg,
        border: `1px solid ${theme.colors.border.default}`,
        marginBottom: theme.spacing.sm,
        opacity: 0.8,
      }}
      role="status"
      aria-live="polite"
    >
      {/* Spinner */}
      <SpinnerIcon />
      <div style={{ flex: 1 }}>
        <span
          style={{
            color: theme.colors.text.primary,
            fontWeight: theme.typography.fontWeight.medium,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('inbox.analysingPriority.label')}
        </span>
        <span
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            marginLeft: theme.spacing.xs,
          }}
        >
          ({count})
        </span>
      </div>
      <p
        style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.xs,
          margin: 0,
        }}
      >
        {t('inbox.analysingPriority.description')}
      </p>
    </div>
  );
};
