import React from 'react';

import { LegalList } from 'components/legal/LegalList';
import { LegalSection } from 'components/legal/LegalSection';
import { PrivacyPolicyContentPart1 } from 'pages/privacy/PrivacyPolicyContentPart1';
import { PrivacyPolicyContentPart2 } from 'pages/privacy/PrivacyPolicyContentPart2';

// Newest first; add an entry with every policy version bump.
const CHANGE_SUMMARIES = [
  {
    date: '5 November 2026',
    changes: [
      'Section 3.1 explains which decisions about your email computer programs make on their own, which they help you make, what information they use, and how to ask a person to review one.',
      'Section 3.2 explains that we may train a small model for your account only, from your own email.',
      'Section 5.3 confirms that we follow Google’s API Services User Data Policy, including its Limited Use requirements.',
      'Section 7 explains how to use your rights and adds the rights and regulators for Australia, the EU and UK, New Zealand and the United States.',
      'Section 8 raises the minimum age from 13 to 16.',
    ],
  },
  {
    date: '19 October 2026',
    changes: [
      'Section 5.1 lists each AI service that processes your email (TypeSafe AI, Google Gemini, OpenAI and Amazon Bedrock), what each one receives, why, and its retention and training terms.',
      'Section 5.2 explains that some of this processing happens outside Australia, and where.',
    ],
  },
  {
    date: '13 October 2026',
    changes: ['Section 2.3 explains email open tracking and the data it records.'],
  },
];

export const PrivacyPolicyContent: React.FC = () => {
  return (
    <>
      <LegalSection
        title="Summary of Changes"
        subsections={CHANGE_SUMMARIES.map(summary => ({
          title: summary.date,
          content: <LegalList items={summary.changes} />,
        }))}
      />
      <PrivacyPolicyContentPart1 />
      <PrivacyPolicyContentPart2 />
    </>
  );
};
