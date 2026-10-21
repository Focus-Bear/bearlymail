import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';

import { ToggleSwitch } from 'components/common/ToggleSwitch';
import { API_URL } from 'config/api';
import { OPEN_TRACKING_SETTINGS_ANCHOR } from 'constants/openTracking';
import { SETTINGS_PLANS_ROUTE } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useNotifications } from 'contexts/NotificationContext';
import { useIsEmailTrackingIncluded } from 'hooks/useIsEmailTrackingIncluded';

const PlanUpgradeNote: React.FC = () => {
  const { t } = useTranslation();
  return (
    <p
      style={{ margin: `${theme.spacing.sm} 0 0`, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.primary }}
      data-testid="email-tracking-upgrade-note"
    >
      {t('settings.emailTracking.notIncluded')}{' '}
      <Link
        to={SETTINGS_PLANS_ROUTE}
        style={{ color: theme.colors.primary.main, fontWeight: theme.typography.fontWeight.semibold }}
      >
        {t('settings.emailTracking.viewPlans')}
      </Link>
    </p>
  );
};

/**
 * Settings → "Track email opens". On by default (Mailtrack-style); explains
 * plainly what a tracking image does and its limits, so the choice is informed.
 * On a plan without email tracking the toggle shows off and locked, with an
 * upgrade prompt; the saved preference is kept for when they upgrade.
 */
export const EmailTrackingSection: React.FC = () => {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const { showError } = useNotifications();
  const [isSaving, setIsSaving] = useState(false);
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);
  const isIncludedInPlan = useIsEmailTrackingIncluded();
  const isTrackingOn = isIncludedInPlan && (pendingValue ?? user?.trackEmailOpens !== false);

  const handleToggle = async (next: boolean) => {
    setPendingValue(next);
    setIsSaving(true);
    try {
      await axios.put(`${API_URL}/users/me`, { trackEmailOpens: next });
      await refreshUser();
    } catch (err: unknown) {
      console.error('Failed to update open tracking setting:', err);
      showError(t('settings.emailTracking.saveError'));
    } finally {
      setPendingValue(null);
      setIsSaving(false);
    }
  };

  return (
    <section id={OPEN_TRACKING_SETTINGS_ANCHOR} style={{ marginBottom: theme.spacing.xl }}>
      <h2
        style={{
          fontSize: theme.typography.fontSize.xl,
          fontWeight: theme.typography.fontWeight.semibold,
          marginBottom: theme.spacing.md,
          color: theme.colors.text.primary,
        }}
      >
        {t('settings.emailTracking.title')}
      </h2>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: theme.spacing.lg,
          padding: theme.spacing.md,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.md,
          backgroundColor: theme.colors.background.paper,
        }}
      >
        <div>
          <div
            style={{
              fontSize: theme.typography.fontSize.md,
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.xs,
            }}
          >
            {t('settings.emailTracking.label')}
          </div>
          <p style={{ margin: 0, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            {t('settings.emailTracking.description')}
          </p>
          <p
            style={{
              margin: `${theme.spacing.sm} 0 0`,
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.tertiary,
            }}
          >
            {t('settings.emailTracking.limitations')}
          </p>
          {!isIncludedInPlan && <PlanUpgradeNote />}
        </div>
        <ToggleSwitch
          isOn={isTrackingOn}
          onToggle={handleToggle}
          isDisabled={isSaving || !isIncludedInPlan}
          ariaLabel={t('settings.emailTracking.label')}
          testId="email-tracking-toggle"
        />
      </div>
    </section>
  );
};
