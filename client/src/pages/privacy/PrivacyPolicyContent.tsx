import React from 'react';

import { PrivacyPolicyContentPart1 } from 'pages/privacy/PrivacyPolicyContentPart1';
import { PrivacyPolicyContentPart2 } from 'pages/privacy/PrivacyPolicyContentPart2';

export const PrivacyPolicyContent: React.FC = () => {
  return (
    <>
      <PrivacyPolicyContentPart1 />
      <PrivacyPolicyContentPart2 />
    </>
  );
};
