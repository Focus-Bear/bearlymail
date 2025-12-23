import React from 'react';
import { theme } from '../../../theme/theme';

interface SyncStatus {
  lastSyncTime: string | null;
  nextBatchDeliveryTime: string | null;
  deliverySchedule: {
    deliveryDays: number[];
    deliveryTimes: string[];
    timezone: string;
  } | null;
}

interface DebugStatsSectionProps {
  syncStatus: SyncStatus | null;
  loadingSyncStatus: boolean;
}

/**
 * Debug stats section component
 * Displays sync status and delivery information
 */
export const DebugStatsSection: React.FC<DebugStatsSectionProps> = ({
  syncStatus,
  loadingSyncStatus,
}) => {
  const calculateTimeAgo = (lastSync: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - lastSync.getTime();
    const diffMins = Math.floor(diffMs / 60000);
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

  const calculateNextDelivery = (nextDeliveryTime: string): string => {
    const nextDelivery = new Date(nextDeliveryTime);
    const now = new Date();
    const nextDiffMs = nextDelivery.getTime() - now.getTime();

    if (nextDiffMs <= 0) {
      return 'overdue';
    }

    const nextDiffMins = Math.floor(nextDiffMs / 60000);
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

  const formatDeliverySchedule = (schedule: SyncStatus['deliverySchedule']): string => {
    if (!schedule) return '';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = schedule.deliveryDays.map((d) => dayNames[d]).join(', ');
    const times = schedule.deliveryTimes.join(', ');
    return `${times} on ${days} (${schedule.timezone})`;
  };

  if (loadingSyncStatus) {
    return (
      <div style={{ color: theme.colors.text.secondary }}>Loading sync status...</div>
    );
  }

  if (!syncStatus?.lastSyncTime) {
    return (
      <div style={{ color: theme.colors.text.secondary }}>No sync history found</div>
    );
  }

  const lastSync = new Date(syncStatus.lastSyncTime);
  const now = new Date();
  const diffMs = now.getTime() - lastSync.getTime();
  const minsSinceSync = diffMs / (1000 * 60);
  const syncFrequencyMins = 5;
  const isStale = minsSinceSync > syncFrequencyMins * 2;

  const timeAgo = calculateTimeAgo(lastSync);
  const nextDeliveryInfo = syncStatus.nextBatchDeliveryTime
    ? calculateNextDelivery(syncStatus.nextBatchDeliveryTime)
    : null;
  const scheduleText = formatDeliverySchedule(syncStatus.deliverySchedule);

  return (
    <div>
      <div
        style={{
          color: isStale ? '#dc3545' : '#28a745',
          fontWeight: 'bold',
          marginBottom: theme.spacing.xs,
        }}
      >
        Last sync: {timeAgo} {isStale && '⚠️ (Sync may be stale)'}
      </div>
      {nextDeliveryInfo && (
        <div
          style={{
            color: nextDeliveryInfo === 'overdue' ? '#dc3545' : theme.colors.text.primary,
            fontWeight: 'bold',
            marginBottom: theme.spacing.xs,
          }}
        >
          Next batch delivery: {nextDeliveryInfo}
        </div>
      )}
      <div
        style={{
          fontSize: '0.65rem',
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xs,
        }}
      >
        Last sync: {lastSync.toLocaleString()}
      </div>
      {syncStatus.nextBatchDeliveryTime && (
        <div
          style={{
            fontSize: '0.65rem',
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xs,
          }}
        >
          Next delivery: {new Date(syncStatus.nextBatchDeliveryTime).toLocaleString()}
        </div>
      )}
      {scheduleText && (
        <div
          style={{
            fontSize: '0.65rem',
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xs,
          }}
        >
          Delivery schedule: {scheduleText}
        </div>
      )}
      <div
        style={{
          fontSize: '0.65rem',
          color: theme.colors.text.secondary,
        }}
      >
        Email syncs run every {syncFrequencyMins} minutes to check for new emails and update status. Batch delivery
        happens at scheduled times ({scheduleText || 'see schedule above'}).
      </div>
    </div>
  );
};

