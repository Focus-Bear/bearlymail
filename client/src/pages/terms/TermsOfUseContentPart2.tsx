import React from 'react';

import { LegalList } from 'components/legal/LegalList';
import { LegalParagraph } from 'components/legal/LegalParagraph';
import { LegalSection } from 'components/legal/LegalSection';

export const TermsOfUseContentPart2: React.FC = () => {
  return (
    <>
      <LegalSection title="8. Third-Party Services">
        <LegalParagraph>
          The Service integrates with third-party services (Google, OpenAI, etc.). Your use of these services is subject
          to their respective terms of service and privacy policies.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="9. Disclaimers">
        <LegalParagraph>
          THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. We do not guarantee that:
        </LegalParagraph>
        <LegalList
          items={[
            'The Service will be uninterrupted or error-free',
            'All emails will be processed correctly',
            'AI-generated content will be accurate or appropriate',
            'The Service will meet your specific requirements',
          ]}
        />
      </LegalSection>

      <LegalSection title="10. Limitation of Liability">
        <LegalParagraph>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, BEARLYMAIL SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
          CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="11. Termination">
        <LegalParagraph>
          We may terminate or suspend your account and access to the Service immediately, without prior notice, for
          conduct that we believe violates these Terms or is harmful to other users, us, or third parties.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="12. Changes to Terms">
        <LegalParagraph>
          We reserve the right to modify these Terms at any time. Material changes will be notified to you via email or
          through the Service. Your continued use after such changes constitutes acceptance.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="13. Governing Law">
        <LegalParagraph>
          These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict
          of law principles.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="14. Contact Information">
        <LegalParagraph>For questions about these Terms, please contact us at:</LegalParagraph>
        <LegalParagraph>
          Email: legal@bearlymail.com
          <br />
          Made by Focus Bear
        </LegalParagraph>
      </LegalSection>
    </>
  );
};
