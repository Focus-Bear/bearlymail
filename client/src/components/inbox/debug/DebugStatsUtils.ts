import { MILLISECONDS_PER_MINUTE } from 'components/inbox/constants';
import { HOURS_PER_DAY, MINUTES_PER_HOUR } from 'constants/numbers';

export interface DeliverySchedule {
  deliveryDays: number[];
  deliveryTimes: string[];
  timezone: string;
}

export const calculateTimeAgo = (lastSync: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - lastSync.getTime();
  const diffMins = Math.floor(diffMs / MILLISECONDS_PER_MINUTE);
  const diffHours = Math.floor(diffMins / MINUTES_PER_HOUR);
  const diffDays = Math.floor(diffHours / HOURS_PER_DAY);

  if (diffMins < 1) {
    return 'just now';
  }
  if (diffMins < MINUTES_PER_HOUR) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  }
  if (diffHours < HOURS_PER_DAY) {
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
  const nextDiffHours = Math.floor(nextDiffMins / MINUTES_PER_HOUR);
  const nextDiffDays = Math.floor(nextDiffHours / HOURS_PER_DAY);

  if (nextDiffMins < 1) {
    return 'imminently';
  }
  if (nextDiffMins < MINUTES_PER_HOUR) {
    return `in ${nextDiffMins} minute${nextDiffMins !== 1 ? 's' : ''}`;
  }
  if (nextDiffHours < HOURS_PER_DAY) {
    const remainingMins = nextDiffMins % MINUTES_PER_HOUR;
    if (remainingMins > 0) {
      return `in ${nextDiffHours}h ${remainingMins}m`;
    }
    return `in ${nextDiffHours} hour${nextDiffHours !== 1 ? 's' : ''}`;
  }
  const remainingHours = nextDiffHours % HOURS_PER_DAY;
  if (remainingHours > 0) {
    return `in ${nextDiffDays}d ${remainingHours}h`;
  }
  return `in ${nextDiffDays} day${nextDiffDays !== 1 ? 's' : ''}`;
};

export const formatDeliverySchedule = (schedule: DeliverySchedule | null): string => {
  if (!schedule) {
    return '';
  }
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = schedule.deliveryDays.map(dayIndex => dayNames[dayIndex]).join(', ');
  const times = schedule.deliveryTimes.join(', ');
  return `${times} on ${days} (${schedule.timezone})`;
};
