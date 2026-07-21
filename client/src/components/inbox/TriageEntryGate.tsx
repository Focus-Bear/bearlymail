import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface TriageEntryGateProps {
  /** Number of conversations already waiting in Action + Follow-Up. */
  existingWorkCount: number;
  /** Called when the user chooses to search instead of opening Triage. */
  onSearch: () => void;
  /** Called when the user insists on opening Triage (advance to friction modal). */
  onProceed: () => void;
}

/**
 * "Are you sure?" gate shown BEFORE the friction exercise when the user opens
 * Triage with unfinished work. Rendered INLINE in place of the Triage email list
 * (not as a modal overlay), so the tab bar and filters above stay visible and the
 * user can switch to Action/Follow-Up without the list peeking through behind it.
 * Offers a gentle off-ramp (search for a specific email instead) or a deliberate
 * opt-in to peek at the new inbox.
 */
export const TriageEntryGate: React.FC<TriageEntryGateProps> = ({
  existingWorkCount,
  onSearch,
  onProceed,
}) => {
  const { t } = useTranslation();

  return (
    <div
      role="region"
      aria-label={t('inbox.distractionTax.preScreen.title')}
      data-testid="triage-entry-gate"
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        background: theme.colors.background.default,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.md,
      }}
    >
      <div
        style={{
          background: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          width: '100%',
          maxWidth: 460,
          boxShadow: theme.shadows.xl,
        }}
      >
        <div
          style={{ fontSize: '2.75rem', textAlign: 'center', marginBottom: theme.spacing.xs }}
          aria-hidden="true"
        >
          📬
        </div>
        <h3
          style={{
            margin: 0,
            marginBottom: theme.spacing.sm,
            textAlign: 'center',
            fontSize: theme.typography.fontSize.xl,
            color: theme.colors.text.primary,
          }}
        >
          {t('inbox.distractionTax.preScreen.title')}
        </h3>
        <p
          style={{
            margin: 0,
            marginBottom: theme.spacing.lg,
            textAlign: 'center',
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}
        >
          {t('inbox.distractionTax.preScreen.explanation', { count: existingWorkCount })}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
          <button
            type="button"
            onClick={onSearch}
            data-testid="triage-entry-gate-search"
            style={{
              width: '100%',
              padding: `${theme.spacing.md} ${theme.spacing.lg}`,
              borderRadius: theme.borderRadius.md,
              border: `1px solid ${theme.colors.border.medium}`,
              background: theme.colors.background.paper,
              color: theme.colors.text.primary,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.md,
              fontWeight: theme.typography.fontWeight.semibold,
            }}
          >
            {t('inbox.distractionTax.preScreen.searchCta')}
          </button>
          <button
            type="button"
            onClick={onProceed}
            data-testid="triage-entry-gate-proceed"
            style={{
              width: '100%',
              padding: `${theme.spacing.md} ${theme.spacing.lg}`,
              borderRadius: theme.borderRadius.md,
              border: 'none',
              background: theme.colors.primary.main,
              color: theme.colors.text.inverse,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.md,
              fontWeight: theme.typography.fontWeight.bold,
            }}
          >
            {t('inbox.distractionTax.preScreen.proceedCta')}
          </button>
        </div>
      </div>
    </div>
  );
};
