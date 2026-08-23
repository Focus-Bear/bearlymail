import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useVolumeUsage } from 'queries/useOrgUsage';
import { theme } from 'theme/theme';

import { isPlanExpiredWarningVisible, PlanStatusBanner } from 'components/settings/PlanStatusBanner';
import { SETTINGS_PLANS_ROUTE } from 'constants/strings';

const containerStyle: React.CSSProperties = {
  padding: `${theme.spacing.sm} ${theme.spacing.md} 0`,
};

/**
 * Renders the trial-expired / over-free-limit warning at the top of the Inbox
 * so an unpaid user sees the same upgrade nudge they get in Team settings —
 * without it, the AI-processing cap is only discoverable on the settings page.
 * Reuses PlanStatusBanner (in `expiredOnly` mode) and the shared org-usage
 * query, so the copy, styling, and show conditions stay in one place. The
 * Upgrade CTA deep-links to Settings > Team & Plan, which auto-opens the plan
 * picker. Renders nothing for trialling, active, or self-hosted orgs.
 */
export const InboxPlanStatusBanner: React.FC = () => {
  const navigate = useNavigate();
  const { data: volumeUsage } = useVolumeUsage();

  if (!isPlanExpiredWarningVisible(volumeUsage)) {
    return null;
  }

  return (
    <div style={containerStyle}>
      <PlanStatusBanner
        volumeUsage={volumeUsage}
        expiredOnly
        onUpgradeClick={() => navigate(SETTINGS_PLANS_ROUTE)}
      />
    </div>
  );
};
