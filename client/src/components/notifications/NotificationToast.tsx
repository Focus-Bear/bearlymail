import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { EXIT_ANIMATION_DURATION_MS, TOAST_ACTION_FOCUS_DELAY_MS, TOAST_ENTRANCE_DELAY_MS } from 'constants/numbers';
import {
  KEY_ESCAPE,
  NOTIFICATION_TYPE_ERROR,
  NOTIFICATION_TYPE_SUCCESS,
  NOTIFICATION_TYPE_WARNING,
  STRING_NONE,
} from 'constants/strings';
import { Notification } from 'contexts/NotificationContext';

interface NotificationToastProps {
  notification: Notification;
  onClose: () => void;
}

function getNotificationColor(type: string): string {
  switch (type) {
    case NOTIFICATION_TYPE_SUCCESS:
      return theme.colors.accent.success || '#10b981';
    case NOTIFICATION_TYPE_ERROR:
      return theme.colors.accent.error || '#ef4444';
    case NOTIFICATION_TYPE_WARNING:
      return theme.colors.accent.warning || '#f59e0b';
    default:
      return theme.colors.primary.main || '#3b82f6';
  }
}

function getNotificationIcon(type: string): string {
  switch (type) {
    case NOTIFICATION_TYPE_SUCCESS:
      return '✓';
    case NOTIFICATION_TYPE_ERROR:
      return '✕';
    case NOTIFICATION_TYPE_WARNING:
      return '⚠';
    default:
      return 'ℹ';
  }
}

export const NotificationToast: React.FC<NotificationToastProps> = ({ notification, onClose }) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Trigger entrance animation
    const entranceTimer = setTimeout(() => setIsVisible(true), TOAST_ENTRANCE_DELAY_MS);

    // Focus the action button (Undo) when present for accessibility
    const focusTimer = setTimeout(() => {
      if (notification.action && actionButtonRef.current) {
        actionButtonRef.current.focus();
      }
    }, TOAST_ACTION_FOCUS_DELAY_MS);

    return () => {
      clearTimeout(entranceTimer);
      clearTimeout(focusTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle keyboard navigation within toast
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === KEY_ESCAPE) {
      handleClose();
    }
  };

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, EXIT_ANIMATION_DURATION_MS);
  };

  const handleActionClick = () => {
    if (notification.action) {
      notification.action.onClick();
    }
    handleClose();
  };

  const backgroundColor = getNotificationColor(notification.type);
  const icon = getNotificationIcon(notification.type);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onKeyDown={handleKeyDown}
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
        flexDirection: 'column',
        gap: theme.spacing.xs,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing.sm }}>
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
          ref={closeButtonRef}
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
          aria-label={t('common.closeNotification')}
        >
          ×
        </button>
      </div>
      {notification.action && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: theme.spacing.xs }}>
          <button
            ref={actionButtonRef}
            onClick={handleActionClick}
            style={{
              background: STRING_NONE,
              border: `1px solid ${backgroundColor}`,
              color: backgroundColor,
              cursor: 'pointer',
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              borderRadius: theme.borderRadius.sm,
              fontSize: theme.typography.fontSize.sm,
              fontWeight: 'bold',
              lineHeight: 1.4,
            }}
          >
            {notification.action.label}
          </button>
        </div>
      )}
    </div>
  );
};
