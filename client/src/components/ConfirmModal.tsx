import React, { useEffect } from 'react';
import { theme } from 'theme/theme';

import { ConfirmModalBody, ConfirmModalFooter, ConfirmModalHeader } from 'components/modal';
import { OPACITY_HALF, Z_INDEX_MODAL_OVERLAY } from 'constants/numbers';
import { KEY_ESCAPE } from 'constants/strings';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
  icon?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional third action rendered between cancel and confirm. */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/** Escape answers the dialog with its cancel action, like clicking the backdrop. */
const useCancelOnEscape = (isOpen: boolean, onCancel: () => void) => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEY_ESCAPE) {
        event.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);
};

/**
 * Confirm modal component
 * Displays a confirmation dialog with customizable title, message, and actions
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = theme.colors.accent.error,
  icon = '⚠️',
  onConfirm,
  onCancel,
  secondaryLabel,
  onSecondary,
}) => {
  useCancelOnEscape(isOpen, onCancel);

  if (!isOpen) {
    return null;
  }

  return (
    <div
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
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
        <ConfirmModalHeader icon={icon} title={title} />
        <ConfirmModalBody message={message} />
        <ConfirmModalFooter
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          confirmColor={confirmColor}
          onConfirm={onConfirm}
          onCancel={onCancel}
          secondaryLabel={secondaryLabel}
          onSecondary={onSecondary}
        />
      </div>

      <style>{`
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};
