import React, { useEffect, useState } from 'react';
import { theme } from 'theme/theme';
import { EXIT_ANIMATION_DURATION_MS } from 'constants/numbers';
import { Notification } from 'contexts/NotificationContext';

interface NotificationToastProps {
  notification: Notification;
  onClose: () => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notification,
  onClose,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    setTimeout(() => setIsVisible(true), 10);

    // Auto-close if duration is set
    if (notification.duration && notification.duration > 0) {
      const timer = setTimeout(() => {
        setIsExiting(true);
        setTimeout(onClose, EXIT_ANIMATION_DURATION_MS); // Wait for exit animation
      }, notification.duration);

      return () => clearTimeout(timer);
    }
  }, [notification.duration, onClose]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, EXIT_ANIMATION_DURATION_MS);
  };

  const getBackgroundColor = (): string => {
    switch (notification.type) {
      case 'success':
        return theme.colors.accent.success || '#10b981';
      case 'error':
        return theme.colors.accent.error || '#ef4444';
      case 'warning':
        return theme.colors.accent.warning || '#f59e0b';
      case 'info':
      default:
        return theme.colors.primary.main || '#3b82f6';
    }
  };

  const getIcon = (): string => {
    switch (notification.type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      case 'info':
      default:
        return 'ℹ';
    }
  };

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        color: theme.colors.text.primary,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.md,
        boxShadow: theme.shadows.lg,
        minWidth: '300px',
        maxWidth: '400px',
        borderLeft: `4px solid ${getBackgroundColor()}`,
        pointerEvents: 'auto',
        transform: isVisible && !isExiting ? 'translateX(0)' : 'translateX(400px)',
        opacity: isVisible && !isExiting ? 1 : 0,
        transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
        display: 'flex',
        alignItems: 'flex-start',
        gap: theme.spacing.sm,
      }}
    >
      <div
        style={{
          backgroundColor: getBackgroundColor(),
          color: 'white',
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 'bold',
          flexShrink: 0,
        }}
      >
        {getIcon()}
      </div>
      <div style={{ flex: 1 }}>
        <p
          style={{
            margin: 0,
            fontSize: theme.typography.fontSize.sm,
            lineHeight: 1.5,
          }}
        >
          {notification.message}
        </p>
      </div>
      <button
        onClick={handleClose}
        style={{
          background: 'none',
          border: 'none',
          color: theme.colors.text.secondary,
          cursor: 'pointer',
          padding: 0,
          marginLeft: theme.spacing.xs,
          fontSize: '18px',
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  );
};
