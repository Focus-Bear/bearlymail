import { MILLISECONDS_PER_MINUTE } from 'components/inbox/constants';

export interface DeliverySchedule {
  deliveryDays: number[];
  deliveryTimes: string[];
  timezone: string;
}

export const calculateTimeAgo = (lastSync: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - lastSync.getTime();
  const diffMins = Math.floor(diffMs / MILLISECONDS_PER_MINUTE);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) {
    return 'just now';
  }
  if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  }
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
};

export const calculateNextDelivery = (nextDeliveryTime: string): string => {
  const nextDelivery = new Date(nextDeliveryTime);
  const now = new Date();
  const nextDiffMs = nextDelivery.getTime() - now.getTime();

  if (nextDiffMs <= 0) {
    return 'overdue';
  }

  const nextDiffMins = Math.floor(nextDiffMs / MILLISECONDS_PER_MINUTE);
  const nextDiffHours = Math.floor(nextDiffMins / 60);
  const nextDiffDays = Math.floor(nextDiffHours / 24);

  if (nextDiffMins < 1) {
    return 'imminently';
  }
  if (nextDiffMins < 60) {
    return `in ${nextDiffMins} minute${nextDiffMins !== 1 ? 's' : ''}`;
  }
  if (nextDiffHours < 24) {
    const remainingMins = nextDiffMins % 60;
    if (remainingMins > 0) {
      return `in ${nextDiffHours}h ${remainingMins}m`;
    }
    return `in ${nextDiffHours} hour${nextDiffHours !== 1 ? 's' : ''}`;
  }
  const remainingHours = nextDiffHours % 24;
  if (remainingHours > 0) {
    return `in ${nextDiffDays}d ${remainingHours}h`;
  }
  return `in ${nextDiffDays} day${nextDiffDays !== 1 ? 's' : ''}`;
};

export const formatDeliverySchedule = (schedule: DeliverySchedule | null): string => {
  if (!schedule) return '';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = schedule.deliveryDays.map((dayIndex) => dayNames[dayIndex]).join(', ');
  const times = schedule.deliveryTimes.join(', ');
  return `${times} on ${days} (${schedule.timezone})`;
};

