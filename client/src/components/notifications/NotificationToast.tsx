import React, { useEffect, useState } from 'react';
import { theme } from 'theme/theme';
import { EXIT_ANIMATION_DURATION_MS } from 'constants/numbers';
import { NOTIFICATION_TYPE_ERROR, NOTIFICATION_TYPE_SUCCESS, NOTIFICATION_TYPE_WARNING, STRING_NONE } from 'constants/strings';
import { Notification } from 'contexts/NotificationContext';
import { COLOR_NAMED_WHITE } from 'constants/colors';

interface NotificationToastProps {
  notification: Notification;
  onClose: () => void;
}

function getNotificationColor(type: string): string {
  switch (type) {
    case NOTIFICATION_TYPE_SUCCESS: return theme.colors.accent.success || '#10b981';
    case NOTIFICATION_TYPE_ERROR: return theme.colors.accent.error || '#ef4444';
    case NOTIFICATION_TYPE_WARNING: return theme.colors.accent.warning || '#f59e0b';
    default: return theme.colors.primary.main || '#3b82f6';
  }
}

function getNotificationIcon(type: string): string {
  switch (type) {
    case NOTIFICATION_TYPE_SUCCESS: return '✓';
    case NOTIFICATION_TYPE_ERROR: return '✕';
    case NOTIFICATION_TYPE_WARNING: return '⚠';
    default: return 'ℹ';
  }
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

  const backgroundColor = getNotificationColor(notification.type);
  const icon = getNotificationIcon(notification.type);

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
        borderLeft: `4px solid ${backgroundColor}`,
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
          backgroundColor: backgroundColor,
          color: COLOR_NAMED_WHITE,
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
        {icon}
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
          background: STRING_NONE,
          border: STRING_NONE,
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
