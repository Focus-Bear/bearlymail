import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

const DELIVERY_TIMEZONE_ID = 'delivery-timezone';

/** Every IANA time zone the browser knows, or a short list on older browsers. */
const TIMEZONE_OPTIONS: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Kolkata',
      'Australia/Sydney',
      'Australia/Melbourne',
      'Pacific/Auckland',
    ];
  }
})();

/** The time zone the delivery times are in. */
export const DeliveryTimezoneSelect: React.FC<{ timezone: string; onChange: (tz: string) => void }> = ({
  timezone,
  onChange,
}) => {
  const { t } = useTranslation();
  return (
    <div style={{ marginBottom: theme.spacing.lg }}>
      <label
        htmlFor={DELIVERY_TIMEZONE_ID}
        style={{
          display: 'block',
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('settings.delivery.timezone')}
      </label>
      <select
        id={DELIVERY_TIMEZONE_ID}
        value={timezone}
        onChange={event => onChange(event.target.value)}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.sm,
          border: `1px solid ${theme.colors.border.medium}`,
          fontSize: theme.typography.fontSize.sm,
          backgroundColor: theme.colors.background.paper,
          color: theme.colors.text.primary,
          minWidth: '250px',
        }}
      >
        {TIMEZONE_OPTIONS.map(tz => (
          <option key={tz} value={tz}>
            {tz.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
    </div>
  );
};
