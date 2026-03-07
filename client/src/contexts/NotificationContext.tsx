import React, { createContext, ReactNode,useCallback, useContext, useState } from 'react';
import { theme } from 'theme/theme';

import { NotificationToast } from 'components/notifications/NotificationToast';
import { ERROR_NOTIFICATION_DURATION_MS } from 'constants/numbers';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
}

interface NotificationContextType {
  showNotification: (message: string, type?: NotificationType, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const DEFAULT_DURATION = 4000; // 4 seconds

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((notif) => notif.id !== id));
  }, []);

  const showNotification = useCallback(
    (message: string, type: NotificationType = 'info', duration: number = DEFAULT_DURATION) => {
      const id = `notification-${Date.now()}-${Math.random()}`;
      const notification: Notification = { id, message, type, duration };
      
      setNotifications((prev) => [...prev, notification]);

      // Auto-remove after duration
      if (duration > 0) {
        setTimeout(() => {
          removeNotification(id);
        }, duration);
      }
    },
    [removeNotification],
  );

  const showSuccess = useCallback(
    (message: string, duration?: number) => {
      showNotification(message, 'success', duration);
    },
    [showNotification],
  );

  const showError = useCallback(
    (message: string, duration?: number) => {
      showNotification(message, 'error', duration || ERROR_NOTIFICATION_DURATION_MS); // Errors stay longer
    },
    [showNotification],
  );

  const showInfo = useCallback(
    (message: string, duration?: number) => {
      showNotification(message, 'info', duration);
    },
    [showNotification],
  );

  const showWarning = useCallback(
    (message: string, duration?: number) => {
      showNotification(message, 'warning', duration);
    },
    [showNotification],
  );

  return (
    <NotificationContext.Provider
      value={{ showNotification, showSuccess, showError, showInfo, showWarning }}
    >
      {children}
      <div
        style={{
          position: 'fixed',
          top: theme.spacing.lg,
          right: theme.spacing.lg,
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.sm,
          pointerEvents: 'none',
        }}
      >
        {notifications.map((notification) => (
          <NotificationToast
            key={notification.id}
            notification={notification}
            onClose={() => removeNotification(notification.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};
