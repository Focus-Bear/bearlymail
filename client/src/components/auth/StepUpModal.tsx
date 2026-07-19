import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { OPACITY_DISABLED, OPACITY_FULL, OPACITY_HALF, Z_INDEX_MODAL_OVERLAY } from 'constants/numbers';

interface StepUpModalProps {
  isOpen: boolean;
  /** Called with the user's entered password when they click Confirm. */
  onConfirm: (password: string) => void;
  onCancel: () => void;
  /** Display an inline error (e.g. wrong password). */
  error?: string | null;
  isLoading?: boolean;
}

/**
 * Password confirmation modal for step-up authentication.
 * Shown when a sensitive action (e.g. disconnecting a connected account) requires
 * re-verification of the user's password before proceeding.
 * (OWASP ASVS req 4.2.1)
 */
export const StepUpModal: React.FC<StepUpModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  error,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');

  // Reset password field when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPassword('');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onConfirm(password);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="step-up-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: `rgba(0, 0, 0, ${OPACITY_HALF})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: Z_INDEX_MODAL_OVERLAY,
        padding: theme.spacing.lg,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          maxWidth: '420px',
          width: '100%',
          boxShadow: theme.shadows.xl,
          animation: 'fadeInScale 0.2s ease-out',
        }}
        onClick={event => event.stopPropagation()}
      >
        <h3
          id="step-up-modal-title"
          style={{
            margin: 0,
            marginBottom: theme.spacing.sm,
            color: theme.colors.text.primary,
            fontSize: theme.typography.fontSize.xl,
          }}
        >
          🔒 {t('stepUp.title')}
        </h3>

        <p
          style={{
            margin: 0,
            marginBottom: theme.spacing.lg,
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('stepUp.description')}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: theme.spacing.md }}>
            <label
              htmlFor="step-up-password"
              style={{
                display: 'block',
                marginBottom: theme.spacing.xs,
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                color: theme.colors.text.primary,
              }}
            >
              {t('stepUp.passwordLabel')}
            </label>

            <input
              id="step-up-password"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoFocus
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: theme.spacing.sm,
                border: `1px solid ${error ? theme.colors.accent.error : theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.sm,
                fontSize: theme.typography.fontSize.sm,
                boxSizing: 'border-box',
                outline: 'none',
                color: theme.colors.text.primary,
                backgroundColor: theme.colors.background.paper,
              }}
            />

            {error && (
              <p
                role="alert"
                style={{
                  margin: 0,
                  marginTop: theme.spacing.xs,
                  color: theme.colors.accent.error,
                  fontSize: theme.typography.fontSize.xs,
                }}
              >
                {error}
              </p>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              gap: theme.spacing.sm,
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: theme.colors.common.transparent,
                color: theme.colors.text.secondary,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.sm,
                fontSize: theme.typography.fontSize.sm,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? OPACITY_DISABLED : OPACITY_FULL,
              }}
            >
              {t('common.cancel')}
            </button>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: theme.colors.primary.main,
                color: theme.colors.common.white,
                border: 'none',
                borderRadius: theme.borderRadius.sm,
                fontSize: theme.typography.fontSize.sm,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? OPACITY_DISABLED : OPACITY_FULL,
                fontWeight: theme.typography.fontWeight.medium,
              }}
            >
              {isLoading ? t('stepUp.verifying') : t('stepUp.confirm')}
            </button>
          </div>
        </form>

        <style>{`
          @keyframes fadeInScale {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    </div>
  );
};
