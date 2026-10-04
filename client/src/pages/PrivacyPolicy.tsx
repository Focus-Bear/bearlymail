import React from 'react';

import { LegalPageLayout } from 'components/legal/LegalPageLayout';
import { LEGAL_LAST_UPDATED } from 'constants/legal';
import { PrivacyPolicyContent } from 'pages/privacy/PrivacyPolicyContent';

const PrivacyPolicy: React.FC = () => {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated={LEGAL_LAST_UPDATED.PRIVACY_POLICY}>
      <PrivacyPolicyContent />
    </LegalPageLayout>
  );
};

export default PrivacyPolicy;
