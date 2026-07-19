import React from 'react';

import { LegalPageLayout } from 'components/legal/LegalPageLayout';
import { TermsOfUseContent } from 'pages/terms/TermsOfUseContent';

const TermsOfUse: React.FC = () => {
  return (
    <LegalPageLayout title="Terms of Use">
      <TermsOfUseContent />
    </LegalPageLayout>
  );
};

export default TermsOfUse;
