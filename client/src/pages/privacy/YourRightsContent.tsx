import React from 'react';

import { LegalList } from 'components/legal/LegalList';
import { LegalParagraph } from 'components/legal/LegalParagraph';
import { LegalSection } from 'components/legal/LegalSection';
import { PRIVACY_CONTACT_EMAIL, PRIVACY_REGULATOR_URLS } from 'constants/legal';

const RegulatorLink: React.FC<{ url: string; children: React.ReactNode }> = ({ url, children }) => (
  <a href={url} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);

const AustraliaRights: React.FC = () => (
  <LegalParagraph>
    We handle your personal information in line with the Australian Privacy Principles in the Privacy Act 1988 (Cth). If
    you are not satisfied with our response to a complaint, you can complain to the{' '}
    <RegulatorLink url={PRIVACY_REGULATOR_URLS.AUSTRALIA_OAIC}>
      Office of the Australian Information Commissioner
    </RegulatorLink>
    .
  </LegalParagraph>
);

const EuropeAndUkRights: React.FC = () => (
  <LegalParagraph>
    If you are in the European Union or the United Kingdom, the GDPR or UK GDPR gives you the rights above, the right to
    restrict how we process your data, and the right not to be subject to a decision based solely on automated
    processing that has legal or similarly significant effects on you (see section 3.1). You can complain to the data
    protection authority where you live or work; in the UK, that is the{' '}
    <RegulatorLink url={PRIVACY_REGULATOR_URLS.UK_ICO}>Information Commissioner’s Office</RegulatorLink>.
  </LegalParagraph>
);

const NewZealandRights: React.FC = () => (
  <LegalParagraph>
    If you are in New Zealand, you can ask to access and correct your personal information under the Privacy Act 2020,
    and complain to the{' '}
    <RegulatorLink url={PRIVACY_REGULATOR_URLS.NEW_ZEALAND_OPC}>Office of the Privacy Commissioner</RegulatorLink>.
  </LegalParagraph>
);

const UnitedStatesRights: React.FC = () => (
  <LegalParagraph>
    Depending on the state you live in, you may have the right to know what personal information we hold about you, to
    access, correct, delete and get a copy of it, and to opt out of its sale, targeted advertising and profiling. We do
    not sell your personal information or share it for targeted advertising, and we will not treat you differently for
    using these rights.
  </LegalParagraph>
);

const RIGHTS = [
  'Access your personal data',
  'Correct inaccurate data',
  'Request deletion of your data',
  'Export your data',
  'Withdraw consent at any time',
  'Object to processing of your data',
];

const RIGHTS_BY_REGION = [
  { title: '7.1 Australia', content: <AustraliaRights /> },
  { title: '7.2 European Union and United Kingdom', content: <EuropeAndUkRights /> },
  { title: '7.3 New Zealand', content: <NewZealandRights /> },
  { title: '7.4 United States', content: <UnitedStatesRights /> },
];

export const YourRightsSection: React.FC = () => (
  <LegalSection title="7. Your Rights" subsections={RIGHTS_BY_REGION}>
    <LegalParagraph>You have the right to:</LegalParagraph>
    <LegalList items={RIGHTS} />
    <LegalParagraph>
      To use any of these rights, email {PRIVACY_CONTACT_EMAIL}. We may ask you to confirm your identity first, and we
      aim to respond within 30 days.
    </LegalParagraph>
  </LegalSection>
);
