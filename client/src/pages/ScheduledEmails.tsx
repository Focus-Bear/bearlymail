import React from 'react';

import { SidebarPageLayout } from 'components/layout/SidebarPageLayout';
import { ScheduledEmailsManager } from 'components/scheduled-emails/ScheduledEmailsManager';

const ScheduledEmails: React.FC = () => {
  return (
    <SidebarPageLayout>
      <ScheduledEmailsManager />
    </SidebarPageLayout>
  );
};

export default ScheduledEmails;
