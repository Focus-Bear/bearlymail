import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { InlineSpinner } from 'components/common/InlineSpinner';
import { STRING_NONE } from 'constants/strings';

interface ToneCheckToastProps {
  visible: boolean;
  onCancel: () => void;
}

/**
 * Fixed-position toast shown while a tone check is in progress.
 * Displays a loading spinner, status text, and a "Cancel send" link.
 * Stays visible regardless of scroll position so the user always knows
 * the tone check is running — even when the Send button is off-screen.
 */
export const ToneCheckToast: React.FC<ToneCheckToastProps> = ({ visible, onCancel }) => {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      // Small delay to trigger CSS transition after mount
      const timer = setTimeout(() => setMounted(true), 10);
      return () => clearTimeout(timer);
    }
    setMounted(false);
  }, [visible]);

  if (!visible) {
    return null;
  }

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      data-testid="tone-check-toast"
      style={{
        position: 'fixed',
        top: theme.spacing.xl,
        left: '50%',
        transform: mounted ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(-20px)',
        opacity: mounted ? 1 : 0,
        transition: 'transform 0.25s ease-out, opacity 0.25s ease-out',
        zIndex: 10001,
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.medium}`,
        borderLeft: `4px solid ${theme.colors.primary.main}`,
        borderRadius: theme.borderRadius.md,
        boxShadow: theme.shadows.lg,
        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.md,
        minWidth: '300px',
        maxWidth: '420px',
        pointerEvents: 'auto',
      }}
    >
      <InlineSpinner size={20} color={theme.colors.primary.main} />

      <span
        style={{
          flex: 1,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.primary,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {t('toneCheck.toastChecking')}
      </span>

      <button
        onClick={onCancel}
        data-testid="tone-check-cancel"
        style={{
          background: STRING_NONE,
          border: STRING_NONE,
          color: theme.colors.text.secondary,
          cursor: 'pointer',
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          fontSize: theme.typography.fontSize.xs,
          textDecoration: 'underline',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {t('toneCheck.cancelSend')}
      </button>
    </div>,
    document.body
  );
};
