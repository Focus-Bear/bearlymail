import React from 'react';
import { theme } from '../theme/theme';

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
}

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
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
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
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.lg,
        }}>
          <span style={{ fontSize: '2rem' }}>{icon}</span>
          <div>
            <h3 style={{
              fontSize: theme.typography.fontSize.lg,
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.sm,
            }}>
              {title}
            </h3>
            <p style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              lineHeight: theme.typography.lineHeight.relaxed,
              margin: 0,
            }}>
              {message}
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: theme.spacing.sm,
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
              backgroundColor: 'transparent',
              color: theme.colors.text.secondary,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
              cursor: 'pointer',
              transition: theme.transitions.fast,
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
              backgroundColor: confirmColor,
              color: '#fff',
              border: 'none',
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
              cursor: 'pointer',
              transition: theme.transitions.fast,
            }}
          >
            {confirmLabel}
          </button>
        </div>
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




