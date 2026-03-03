import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';
import { EMOJI_INFO } from 'constants/emojis';
import { MS_PER_MINUTE, MINUTES_PER_HOUR } from 'constants/numbers';

interface BatchInfoBarProps {
  nextDelivery: Date | null;
  lastUrgentCheck: Date | null;
}

export const BatchInfoBar: React.FC<BatchInfoBarProps> = ({
  nextDelivery,
  lastUrgentCheck,
}) => {
  const { t } = useTranslation();
  const [showDeliveryTooltip, setShowDeliveryTooltip] = useState(false);
  const [showUrgentTooltip, setShowUrgentTooltip] = useState(false);

  const getNextDeliveryText = (): string | null => {
    if (!nextDelivery) return null;
    const now = new Date();
    const diffMs = nextDelivery.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / MS_PER_MINUTE);
    if (diffMins <= 0) return null;

    const diffHours = Math.floor(diffMins / MINUTES_PER_HOUR);
    const remainingMins = diffMins % MINUTES_PER_HOUR;
    if (diffMins < MINUTES_PER_HOUR) {
      return `${diffMins}m`;
    }
    if (remainingMins === 0) {
      return `${diffHours}h`;
    }
    return `${diffHours}h ${remainingMins}m`;
  };

  const getLastCheckText = (): string => {
    if (!lastUrgentCheck) return t('inbox.batchInfo.neverChecked');
    const now = new Date();
    const diffMs = now.getTime() - lastUrgentCheck.getTime();
    const diffMins = Math.round(diffMs / MS_PER_MINUTE);
    
    if (diffMins < 1) return t('inbox.batchInfo.justNow');
    if (diffMins === 1) return t('inbox.batchInfo.oneMinuteAgo');
    if (diffMins < MINUTES_PER_HOUR) return t('inbox.batchInfo.minutesAgo', { count: diffMins });
    
    const diffHours = Math.floor(diffMins / MINUTES_PER_HOUR);
    if (diffHours === 1) return t('inbox.batchInfo.oneHourAgo');
    return t('inbox.batchInfo.hoursAgo', { count: diffHours });
  };

  const nextDeliveryText = getNextDeliveryText();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.xs,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        marginBottom: theme.spacing.md,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.secondary,
      }}
    >
      {/* Next batch delivery */}
      {nextDeliveryText && (
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
          <span>
            {t('inbox.nextBatch')}: <strong style={{ color: theme.colors.text.primary }}>{nextDeliveryText}</strong>
          </span>
          <span
            style={{ cursor: 'pointer', position: 'relative' }}
            onMouseEnter={() => setShowDeliveryTooltip(true)}
            onMouseLeave={() => setShowDeliveryTooltip(false)}
          >
            {EMOJI_INFO}
            {showDeliveryTooltip && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginTop: theme.spacing.xs,
                  padding: theme.spacing.sm,
                  backgroundColor: theme.colors.background.paper,
                  border: `1px solid ${theme.colors.border.light}`,
                  borderRadius: theme.borderRadius.md,
                  boxShadow: theme.shadows.md,
                  width: '280px',
                  zIndex: 1000,
                  fontSize: theme.typography.fontSize.xs,
                  color: theme.colors.text.secondary,
                  lineHeight: theme.typography.lineHeight.relaxed,
                }}
              >
                {t('inbox.batchInfo.deliveryTooltip')}{' '}
                <Link
                  to="/settings#email-batching"
                  style={{ color: theme.colors.primary.main }}
                >
                  {t('inbox.batchInfo.changeInSettings')}
                </Link>
              </div>
            )}
          </span>
        </div>
      )}

      {/* Last urgent check */}
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
        <span>
          {t('inbox.batchInfo.lastUrgentCheck')}: {getLastCheckText()}
        </span>
        <span
          style={{ cursor: 'pointer', position: 'relative' }}
          onMouseEnter={() => setShowUrgentTooltip(true)}
          onMouseLeave={() => setShowUrgentTooltip(false)}
        >
          {EMOJI_INFO}
          {showUrgentTooltip && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: theme.spacing.xs,
                padding: theme.spacing.sm,
                backgroundColor: theme.colors.background.paper,
                border: `1px solid ${theme.colors.border.light}`,
                borderRadius: theme.borderRadius.md,
                boxShadow: theme.shadows.md,
                width: '300px',
                zIndex: 1000,
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.secondary,
                lineHeight: theme.typography.lineHeight.relaxed,
              }}
            >
              {t('inbox.batchInfo.urgentTooltip')}
            </div>
          )}
        </span>
      </div>
    </div>
  );
};
