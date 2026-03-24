import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';

import { EMOJI_INFO } from 'constants/emojis';

import { getLastCheckText, getNextDeliveryText } from './batchInfoBar.helpers';

interface BatchInfoBarProps {
  nextDelivery: Date | null;
  lastUrgentCheck: Date | null;
}

interface BatchInfoTooltipProps {
  children: React.ReactNode;
}

const TOOLTIP_WIDTH_NARROW = '280px';
const TOOLTIP_WIDTH_WIDE = '300px';

const BatchInfoTooltip: React.FC<BatchInfoTooltipProps & { width?: string }> = ({
  children,
  width = TOOLTIP_WIDTH_NARROW,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  return (
    <span
      style={{ cursor: 'pointer', position: 'relative' }}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {EMOJI_INFO}
      {isVisible && (
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
            width,
            zIndex: 1000,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            lineHeight: theme.typography.lineHeight.relaxed,
          }}
        >
          {children}
        </div>
      )}
    </span>
  );
};

export const BatchInfoBar: React.FC<BatchInfoBarProps> = ({ nextDelivery, lastUrgentCheck }) => {
  const { t } = useTranslation();
  const nextDeliveryText = getNextDeliveryText(nextDelivery);

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
        fontSize: theme.typography.fontSize.lg,
        color: theme.colors.text.secondary,
      }}
    >
      {/* Next batch delivery */}
      {nextDeliveryText && (
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
          <span>
            {t('inbox.nextBatch')}: <strong style={{ color: theme.colors.text.primary }}>{nextDeliveryText}</strong>
          </span>
          <BatchInfoTooltip width={TOOLTIP_WIDTH_NARROW}>
            {t('inbox.batchInfo.deliveryTooltip')}{' '}
            <Link to="/settings#email-batching" style={{ color: theme.colors.primary.main }}>
              {t('inbox.batchInfo.changeInSettings')}
            </Link>
          </BatchInfoTooltip>
        </div>
      )}

      {/* Last urgent check */}
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
        <span>
          {t('inbox.batchInfo.lastUrgentCheck')}: {getLastCheckText(lastUrgentCheck, t)}
        </span>
        <BatchInfoTooltip width={TOOLTIP_WIDTH_WIDE}>{t('inbox.batchInfo.urgentTooltip')}</BatchInfoTooltip>
      </div>
    </div>
  );
};
