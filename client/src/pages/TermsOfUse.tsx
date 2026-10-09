import React from 'react';

import { LegalPageLayout } from 'components/legal/LegalPageLayout';
import { LEGAL_LAST_UPDATED } from 'constants/legal';
import { TermsOfUseContent } from 'pages/terms/TermsOfUseContent';

const TermsOfUse: React.FC = () => {
  return (
    <LegalPageLayout title="Terms of Use" lastUpdated={LEGAL_LAST_UPDATED.TERMS_OF_USE}>
      <TermsOfUseContent />
    </LegalPageLayout>
  );
};

export default TermsOfUse;
