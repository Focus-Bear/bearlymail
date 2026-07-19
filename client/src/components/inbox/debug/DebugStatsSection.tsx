import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import {
  calculateNextDelivery,
  calculateTimeAgo,
  DeliverySchedule,
  formatDeliverySchedule,
} from 'components/inbox/debug/DebugStatsUtils';
import { EMOJI_WARNING } from 'constants/emojis';
import { MS_PER_MINUTE } from 'constants/numbers';
import { DELIVERY_STATUS_OVERDUE } from 'constants/strings';

interface SyncStatus {
  lastSyncTime: string | null;
  nextBatchDeliveryTime: string | null;
  deliverySchedule: DeliverySchedule | null;
}

interface DebugStatsSectionProps {
  syncStatus: SyncStatus | null;
  loadingSyncStatus: boolean;
}

/**
 * Debug stats section component
 * Displays sync status and delivery information
 */
export const DebugStatsSection: React.FC<DebugStatsSectionProps> = ({ syncStatus, loadingSyncStatus }) => {
  const { t } = useTranslation();

  if (loadingSyncStatus) {
    return <div style={{ color: theme.colors.text.secondary }}>{t('debug.stats.loading')}</div>;
  }

  if (!syncStatus?.lastSyncTime) {
    return <div style={{ color: theme.colors.text.secondary }}>{t('debug.stats.noSyncHistory')}</div>;
  }

  const lastSync = new Date(syncStatus.lastSyncTime);
  const now = new Date();
  const diffMs = now.getTime() - lastSync.getTime();
  const minsSinceSync = diffMs / MS_PER_MINUTE;
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
        {t('debug.stats.lastSync')}: {timeAgo} {isStale && `${EMOJI_WARNING} ${t('debug.stats.syncStale')}`}
      </div>
      {nextDeliveryInfo && (
        <div
          style={{
            color: nextDeliveryInfo === DELIVERY_STATUS_OVERDUE ? '#dc3545' : theme.colors.text.primary,
            fontWeight: 'bold',
            marginBottom: theme.spacing.xs,
          }}
        >
          {t('debug.stats.nextBatchDelivery')}: {nextDeliveryInfo}
        </div>
      )}
      <div
        style={{
          fontSize: '0.65rem',
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('debug.stats.lastSync')}: {lastSync.toLocaleString()}
      </div>
      {syncStatus.nextBatchDeliveryTime && (
        <div
          style={{
            fontSize: '0.65rem',
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xs,
          }}
        >
          {t('debug.stats.nextDelivery')}: {new Date(syncStatus.nextBatchDeliveryTime).toLocaleString()}
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
          {t('debug.stats.deliverySchedule')}: {scheduleText}
        </div>
      )}
      <div
        style={{
          fontSize: '0.65rem',
          color: theme.colors.text.secondary,
        }}
      >
        {t('debug.stats.syncDescription', {
          minutes: syncFrequencyMins,
          schedule: scheduleText || t('debug.stats.seeScheduleAbove'),
        })}
      </div>
    </div>
  );
};
