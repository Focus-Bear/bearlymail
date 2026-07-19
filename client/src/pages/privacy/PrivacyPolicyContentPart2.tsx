import React from 'react';

import { LegalList } from 'components/legal/LegalList';
import { LegalParagraph } from 'components/legal/LegalParagraph';
import { LegalSection } from 'components/legal/LegalSection';

export const PrivacyPolicyContentPart2: React.FC = () => {
  return (
    <>
      <LegalSection title="6. Data Retention">
        <LegalParagraph>
          We retain your data for as long as your account is active or as needed to provide services. You can request
          deletion of your data at any time by contacting us or deleting your account.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="7. Your Rights">
        <LegalParagraph>You have the right to:</LegalParagraph>
        <LegalList
          items={[
            'Access your personal data',
            'Correct inaccurate data',
            'Request deletion of your data',
            'Export your data',
            'Withdraw consent at any time',
            'Object to processing of your data',
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Children's Privacy">
        <LegalParagraph>
          Our service is not intended for users under the age of 13. We do not knowingly collect information from
          children under 13.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="9. Changes to This Policy">
        <LegalParagraph>
          We may update this Privacy Policy from time to time. We will notify you of any material changes by email or
          through our service. Your continued use after such notification constitutes acceptance of the updated policy.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="10. Contact Us">
        <LegalParagraph>If you have questions about this Privacy Policy, please contact us at:</LegalParagraph>
        <LegalParagraph>
          Email: privacy@bearlymail.com
          <br />
          Made by Focus Bear
        </LegalParagraph>
      </LegalSection>
    </>
  );
};
