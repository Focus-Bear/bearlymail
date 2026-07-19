import React from 'react';

import { LegalPageLayout } from 'components/legal/LegalPageLayout';
import { PrivacyPolicyContent } from 'pages/privacy/PrivacyPolicyContent';

const PrivacyPolicy: React.FC = () => {
  return (
    <LegalPageLayout title="Privacy Policy">
      <PrivacyPolicyContent />
    </LegalPageLayout>
  );
};

export default PrivacyPolicy;
