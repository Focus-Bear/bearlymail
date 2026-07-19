import React, { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { theme } from 'theme/theme';

import { NotificationToast } from 'components/notifications/NotificationToast';
import { ERROR_NOTIFICATION_DURATION_MS, UNDO_TOAST_DURATION_MS } from 'constants/numbers';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
  action?: NotificationAction;
}

interface NotificationContextType {
  showNotification: (message: string, type?: NotificationType, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
  /** Shows a success toast with an Undo button. Returns a cancel function that aborts the deferred commit. */
  showSuccessWithUndo: (message: string, onCommit: () => void, onUndo: () => void, duration?: number) => () => void;
  /** Shows a persistent info toast with no auto-dismiss. Returns a function to dismiss it manually. */
  showLoading: (message: string, action?: NotificationAction) => () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const DEFAULT_DURATION = 4000; // 4 seconds

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
    timerRefs.current.delete(id);
  }, []);

  const showNotification = useCallback(
    (message: string, type: NotificationType = 'info', duration: number = DEFAULT_DURATION) => {
      const id = `notification-${Date.now()}-${Math.random()}`;
      const notification: Notification = { id, message, type, duration };

      setNotifications(prev => [...prev, notification]);

      // Auto-remove after duration
      if (duration > 0) {
        const timer = setTimeout(() => {
          removeNotification(id);
        }, duration);
        timerRefs.current.set(id, timer);
      }
    },
    [removeNotification]
  );

  const showSuccess = useCallback(
    (message: string, duration?: number) => {
      showNotification(message, 'success', duration);
    },
    [showNotification]
  );

  const showError = useCallback(
    (message: string, duration?: number) => {
      showNotification(message, 'error', duration || ERROR_NOTIFICATION_DURATION_MS); // Errors stay longer
    },
    [showNotification]
  );

  const showInfo = useCallback(
    (message: string, duration?: number) => {
      showNotification(message, 'info', duration);
    },
    [showNotification]
  );

  const showWarning = useCallback(
    (message: string, duration?: number) => {
      showNotification(message, 'warning', duration);
    },
    [showNotification]
  );

  const showLoading = useCallback(
    (message: string, action?: NotificationAction): (() => void) => {
      const id = `notification-${Date.now()}-${Math.random()}`;
      const notification: Notification = { id, message, type: 'info', duration: 0, action };
      setNotifications(prev => [...prev, notification]);
      return () => removeNotification(id);
    },
    [removeNotification]
  );

  const showSuccessWithUndo = useCallback(
    (message: string, onCommit: () => void, onUndo: () => void, duration: number = UNDO_TOAST_DURATION_MS): (() => void) => {
      const id = `notification-${Date.now()}-${Math.random()}`;

      let cancelled = false;

      const cancel = () => {
        cancelled = true;
        const existing = timerRefs.current.get(id);
        if (existing) {
          clearTimeout(existing);
          timerRefs.current.delete(id);
        }
        setNotifications(prev => prev.filter(notif => notif.id !== id));
      };

      const notification: Notification = {
        id,
        message,
        type: 'success',
        duration,
        action: {
          label: 'Undo',
          onClick: () => {
            cancel();
            onUndo();
          },
        },
      };

      setNotifications(prev => [...prev, notification]);

      const timer = setTimeout(() => {
        if (!cancelled) {
          setNotifications(prev => prev.filter(notif => notif.id !== id));
          timerRefs.current.delete(id);
          onCommit();
        }
      }, duration);
      timerRefs.current.set(id, timer);

      return cancel;
    },
    []
  );

  return (
    <NotificationContext.Provider value={{ showNotification, showSuccess, showError, showInfo, showWarning, showSuccessWithUndo, showLoading }}>
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
        {notifications.map(notification => (
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
