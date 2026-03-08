import React from 'react';

import { LegalList } from 'components/legal/LegalList';
import { LegalParagraph } from 'components/legal/LegalParagraph';
import { LegalSection } from 'components/legal/LegalSection';

export const TermsOfUseContentPart1: React.FC = () => {
  return (
    <>
      <LegalSection title="1. Agreement to Terms">
        <LegalParagraph>
          By accessing or using BearlyMail ("Service"), you agree to be bound by these Terms of Use. If you disagree
          with any part of these terms, you may not access the Service.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. Description of Service">
        <LegalParagraph>
          BearlyMail is an email management service that helps users organize, prioritize, and manage their email using
          AI-powered features including:
        </LegalParagraph>
        <LegalList
          items={[
            'Email prioritization and scoring',
            'AI-generated summaries',
            'Draft reply suggestions',
            'Email batching and scheduling',
            'Calendar booking integration',
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Account Requirements">
        <LegalParagraph>To use the Service, you must:</LegalParagraph>
        <LegalList
          items={[
            'Be at least 13 years old',
            'Provide accurate and complete registration information',
            'Maintain the security of your account credentials',
            'Notify us immediately of any unauthorized access',
            'Be approved from our waitlist (if applicable)',
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Acceptable Use">
        <LegalParagraph>You agree not to:</LegalParagraph>
        <LegalList
          items={[
            'Use the Service for any illegal purpose',
            'Violate any applicable laws or regulations',
            'Infringe upon intellectual property rights',
            'Transmit harmful code, viruses, or malware',
            'Interfere with or disrupt the Service',
            'Attempt to gain unauthorized access to the Service',
            'Use the Service to send spam or unsolicited emails',
            'Impersonate any person or entity',
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Subscription and Payment">
        <LegalParagraph>The Service may offer free trials and paid subscription plans:</LegalParagraph>
        <LegalList
          items={[
            'Free trials are offered for a limited time (e.g., 7 days)',
            'Subscriptions automatically renew unless canceled',
            'You are responsible for all charges incurred under your account',
            'Refunds are subject to our refund policy',
            'Prices may change with notice to existing subscribers',
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Intellectual Property">
        <LegalParagraph>
          The Service and its original content, features, and functionality are owned by BearlyMail and are protected by
          international copyright, trademark, and other intellectual property laws.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="7. User Content">
        <LegalParagraph>
          You retain ownership of your email content. By using the Service, you grant us a limited license to process,
          store, and analyze your emails solely for the purpose of providing the Service.
        </LegalParagraph>
      </LegalSection>
    </>
  );
};
