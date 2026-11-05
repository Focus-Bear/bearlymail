import React from 'react';

import { LegalParagraph } from 'components/legal/LegalParagraph';
import { LegalSection } from 'components/legal/LegalSection';
import { MINIMUM_USER_AGE, PRIVACY_CONTACT_EMAIL } from 'constants/legal';
import { YourRightsSection } from 'pages/privacy/YourRightsContent';

export const PrivacyPolicyContentPart2: React.FC = () => {
  return (
    <>
      <LegalSection title="6. Data Retention">
        <LegalParagraph>
          We retain your data for as long as your account is active or as needed to provide services. You can request
          deletion of your data at any time by contacting us or deleting your account.
        </LegalParagraph>
      </LegalSection>

      <YourRightsSection />

      <LegalSection title="8. Children's Privacy">
        <LegalParagraph>
          Our service is not intended for users under the age of {MINIMUM_USER_AGE}. We do not knowingly collect
          information from children under {MINIMUM_USER_AGE}.
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
          Email: {PRIVACY_CONTACT_EMAIL}
          <br />
          Made by Focus Bear
        </LegalParagraph>
      </LegalSection>
    </>
  );
};
