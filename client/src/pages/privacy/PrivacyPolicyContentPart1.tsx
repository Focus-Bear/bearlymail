import React from 'react';

import { LegalList } from 'components/legal/LegalList';
import { LegalParagraph } from 'components/legal/LegalParagraph';
import { LegalSection } from 'components/legal/LegalSection';

const DataSecuritySection: React.FC = () => (
  <LegalSection title="4. Data Security">
    <LegalParagraph>We implement industry-standard security measures to protect your data:</LegalParagraph>
    <LegalList
      items={[
        <>
          <strong>Encryption:</strong> All sensitive data, including email content, is encrypted at rest using
          AES-256-GCM encryption
        </>,
        <>
          <strong>Secure Transmission:</strong> All data is transmitted over HTTPS/TLS
        </>,
        <>
          <strong>Access Controls:</strong> Strict access controls limit who can access your data
        </>,
        <>
          <strong>Regular Audits:</strong> We conduct regular security audits and assessments
        </>,
      ]}
    />
  </LegalSection>
);

const ThirdPartyServicesSection: React.FC = () => (
  <LegalSection title="5. Third-Party Services">
    <LegalParagraph>We integrate with the following third-party services:</LegalParagraph>
    <LegalList
      items={[
        <>
          <strong>Google Gmail API:</strong> To access and manage your emails
        </>,
        <>
          <strong>Google Calendar API:</strong> For calendar booking functionality
        </>,
        <>
          <strong>OpenAI/Gemini:</strong> For AI-powered email analysis and summaries (you may use your own API keys)
        </>,
        <>
          <strong>PostHog:</strong> For analytics and product insights
        </>,
        <>
          <strong>RevenueCat:</strong> For subscription management
        </>,
      ]}
    />
    <LegalParagraph>These services have their own privacy policies. We encourage you to review them.</LegalParagraph>
  </LegalSection>
);

export const PrivacyPolicyContentPart1: React.FC = () => {
  return (
    <>
      <LegalSection title="1. Introduction">
        <LegalParagraph>
          BearlyMail ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we
          collect, use, disclose, and safeguard your information when you use our email management service.
        </LegalParagraph>
      </LegalSection>

      <LegalSection
        title="2. Information We Collect"
        subsections={[
          {
            title: '2.1 Account Information',
            content: (
              <LegalParagraph>
                When you register, we collect your email address, name, and any other information you provide during
                registration.
              </LegalParagraph>
            ),
          },
          {
            title: '2.2 Email Data',
            content: (
              <>
                <LegalParagraph>
                  With your explicit consent, we access and process your emails to provide our services. This includes:
                </LegalParagraph>
                <LegalList
                  items={[
                    'Email content (subject, body, sender, recipient)',
                    'Email metadata (dates, thread information, labels)',
                    'Email attachments (processed temporarily for analysis)',
                  ]}
                />
              </>
            ),
          },
          {
            title: '2.3 Usage Data',
            content: (
              <LegalParagraph>
                We collect information about how you interact with our service, including feature usage, preferences,
                and analytics data through PostHog.
              </LegalParagraph>
            ),
          },
        ]}
      />

      <LegalSection title="3. How We Use Your Information">
        <LegalParagraph>We use your information to:</LegalParagraph>
        <LegalList
          items={[
            'Provide, maintain, and improve our email management services',
            'Prioritize and organize your emails using AI-powered analysis',
            'Generate email summaries and draft replies',
            'Personalize your experience based on your usage patterns',
            'Send you service-related communications',
            'Detect and prevent fraud or abuse',
            'Comply with legal obligations',
          ]}
        />
      </LegalSection>

      <DataSecuritySection />
      <ThirdPartyServicesSection />
    </>
  );
};
