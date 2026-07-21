import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { TapTaxUnlock } from 'components/inbox/distraction/TapTaxUnlock';
import { VoiceConfessionUnlock } from 'components/inbox/distraction/VoiceConfessionUnlock';
import {
  UNLOCK_METHOD,
  UNLOCK_METHODS,
  type UnlockMethod,
} from 'constants/distractionFriction';

interface DistractionFrictionModalProps {
  /** Number of conversations already waiting in Action + Follow-Up. */
  existingWorkCount: number;
  /** Called when the user completes either unlock exercise. */
  onUnlock: () => void;
  /** Called when the user backs out without unlocking. */
  onDismiss: () => void;
}

/**
 * The "distraction tax" friction exercise. Explains — warmly and playfully — why
 * peeking at new low-priority emails is gated while work is waiting, then offers
 * two ways to unlock: a spoken confession or a 30-tap tax.
 *
 * Rendered INLINE in place of the Triage email list (not as a modal overlay), so
 * the tab bar and filters above stay visible and interactive — the user can bail
 * to Action/Follow-Up at any point — and the gated list never peeks through.
 */
export const DistractionFrictionModal: React.FC<DistractionFrictionModalProps> = ({
  existingWorkCount,
  onUnlock,
  onDismiss,
}) => {
  const { t } = useTranslation();
  const [method, setMethod] = useState<UnlockMethod>(UNLOCK_METHOD.VOICE);

  return (
    <div
      role="region"
      aria-label={t('inbox.distractionTax.title')}
      data-testid="distraction-friction"
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
        <div style={{ fontSize: '2.75rem', textAlign: 'center', marginBottom: theme.spacing.xs }} aria-hidden="true">
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
          {t('inbox.distractionTax.title')}
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
          {t('inbox.distractionTax.explanation', { count: existingWorkCount })}
        </p>

        <div
          role="tablist"
          aria-label={t('inbox.distractionTax.chooseMethod')}
          style={{
            display: 'flex',
            gap: theme.spacing.xs,
            padding: theme.spacing.xs,
            background: theme.colors.background.default,
            borderRadius: theme.borderRadius.md,
            marginBottom: theme.spacing.lg,
          }}
        >
          {UNLOCK_METHODS.map(unlockMethod => {
            const active = method === unlockMethod;
            return (
              <button
                key={unlockMethod}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMethod(unlockMethod)}
                data-testid={`distraction-method-${unlockMethod}`}
                style={{
                  flex: 1,
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  borderRadius: theme.borderRadius.sm,
                  border: 'none',
                  cursor: 'pointer',
                  background: active ? theme.colors.background.paper : 'transparent',
                  color: active ? theme.colors.text.primary : theme.colors.text.secondary,
                  fontWeight: active ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.normal,
                  fontSize: theme.typography.fontSize.sm,
                  boxShadow: active ? theme.shadows.sm : 'none',
                }}
              >
                {t(`inbox.distractionTax.method.${unlockMethod}`)}
              </button>
            );
          })}
        </div>

        <div style={{ minHeight: 180 }}>
          {method === UNLOCK_METHOD.VOICE ? (
            <VoiceConfessionUnlock onUnlocked={onUnlock} onNeedsFallback={() => setMethod(UNLOCK_METHOD.TAP)} />
          ) : (
            <TapTaxUnlock onUnlocked={onUnlock} />
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: theme.spacing.lg }}>
          <button
            type="button"
            onClick={onDismiss}
            data-testid="distraction-dismiss"
            style={{
              background: 'none',
              border: 'none',
              padding: theme.spacing.xs,
              color: theme.colors.text.tertiary,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
              textDecoration: 'underline',
            }}
          >
            {t('inbox.distractionTax.dismiss')}
          </button>
        </div>
      </div>
    </div>
  );
};
