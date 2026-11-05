import React from 'react';

import { CrmUpgradePrompt } from 'components/crm/CrmUpgradePrompt';
import { SidebarPageLayout } from 'components/layout/SidebarPageLayout';
import { useCrmPlanAccess } from 'hooks/useCrmPlanAccess';

interface CrmPlanGateProps {
  children: React.ReactNode;
}

/**
 * Wraps a CRM page. On a plan without the CRM it shows the upgrade prompt
 * inside the normal page shell instead, so the page never fires the API calls
 * the server would refuse.
 */
export const CrmPlanGate: React.FC<CrmPlanGateProps> = ({ children }) => {
  const { isCrmIncluded, isPlanLoading } = useCrmPlanAccess();

  if (isPlanLoading) {
    return <SidebarPageLayout>{null}</SidebarPageLayout>;
  }
  if (!isCrmIncluded) {
    return (
      <SidebarPageLayout>
        <CrmUpgradePrompt />
      </SidebarPageLayout>
    );
  }
  return <>{children}</>;
};
