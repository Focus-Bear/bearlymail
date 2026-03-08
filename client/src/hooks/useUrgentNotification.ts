import { useCallback, useState } from 'react';

interface UrgentEmail {
  subject: string;
  from: string;
  priorityScore: number;
}

interface UseUrgentNotificationReturn {
  urgentNotification: {
    show: boolean;
    count: number;
    emails: UrgentEmail[];
  };
  showUrgentNotification: (count: number, emails: UrgentEmail[]) => void;
  hideUrgentNotification: () => void;
}

export function useUrgentNotification(): UseUrgentNotificationReturn {
  const [urgentNotification, setUrgentNotification] = useState<{
    show: boolean;
    count: number;
    emails: UrgentEmail[];
  }>({ show: false, count: 0, emails: [] });

  const showUrgentNotification = useCallback((count: number, emails: UrgentEmail[]) => {
    setUrgentNotification({ show: true, count, emails });
  }, []);

  const hideUrgentNotification = useCallback(() => {
    setUrgentNotification({ show: false, count: 0, emails: [] });
  }, []);

  return {
    urgentNotification,
    showUrgentNotification,
    hideUrgentNotification,
  };
}
