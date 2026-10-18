import React from 'react';

import { LegalList } from 'components/legal/LegalList';
import { LegalSection } from 'components/legal/LegalSection';
import { PrivacyPolicyContentPart1 } from 'pages/privacy/PrivacyPolicyContentPart1';
import { PrivacyPolicyContentPart2 } from 'pages/privacy/PrivacyPolicyContentPart2';

// Newest first; add an entry with every policy version bump.
const CHANGE_SUMMARIES = [
  {
    date: '19 October 2026',
    changes: [
      'Section 5.1 lists each AI service that processes your email (TypeSafe AI, Google Gemini, OpenAI and Amazon Bedrock), what each one receives, why, and its retention and training terms.',
      'Section 5.2 explains that some of this processing happens outside Australia, and where.',
    ],
  },
];

const latestChanges = CHANGE_SUMMARIES[0];

export const PrivacyPolicyContent: React.FC = () => {
  return (
    <>
      <LegalSection title={`Summary of changes (${latestChanges.date})`}>
        <LegalList items={latestChanges.changes} />
      </LegalSection>
      <PrivacyPolicyContentPart1 />
      <PrivacyPolicyContentPart2 />
    </>
  );
};
