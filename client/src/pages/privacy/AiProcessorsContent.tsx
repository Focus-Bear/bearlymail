import React from 'react';

import { LegalList } from 'components/legal/LegalList';
import { LegalParagraph } from 'components/legal/LegalParagraph';

interface AiProcessor {
  name: string;
  dataSent: string;
  purposes: string;
  retentionAndTraining: string;
  region: string;
  terms: Array<{ label: string; url: string }>;
}

export const AI_PROCESSORS: AiProcessor[] = [
  {
    name: 'TypeSafe AI (Jev)',
    dataSent:
      'The sender’s name and address, subject, an excerpt of the email body or its AI summary, when it was received, and thread status. For prioritisation, also your saved goals, current work and urgent or not-urgent topics. For categorisation, your category names and descriptions. For some checks, a short draft or voice transcript.',
    purposes:
      'Choosing each email’s category, scoring its urgency and goal alignment for prioritisation, and yes/no checks such as phishing screening, email type, contact type and workflow conditions.',
    retentionAndTraining:
      'TypeSafe states that it does not train or fine-tune models on your input. It keeps data as long as reasonably necessary to provide its service and does not publish a fixed retention period.',
    region: 'United States',
    terms: [
      { label: 'TypeSafe privacy policy', url: 'https://typesafe.ai/legal/privacy-policy' },
      { label: 'TypeSafe terms', url: 'https://typesafe.ai/legal/terms' },
    ],
  },
  {
    name: 'Google Gemini (paid Gemini API)',
    dataSent:
      'Email content (sender, participants, subject, body and thread) or its AI summary, your drafts and writing samples, the file names (not the contents) of attachments on a draft, your saved preferences and category names, and the questions you ask Ask AI.',
    purposes:
      'Drafting replies and follow-ups, checking a draft’s tone, suggesting categories and rules, search, Ask AI, confirming phishing warnings and learning your preferences. Gemini also takes over categorisation when Jev is unsure, and other AI features when Amazon Bedrock is unavailable.',
    retentionAndTraining:
      'We use Google’s paid Gemini API tier, not the free tier. Under Google’s terms for the paid tier, prompts and responses are not used to improve Google’s products. They are logged for a limited period only to detect abuse and for legally required disclosures.',
    region: 'No specific region is guaranteed; Google may process requests in any country where it operates.',
    terms: [{ label: 'Gemini API additional terms', url: 'https://ai.google.dev/gemini-api/terms' }],
  },
  {
    name: 'OpenAI',
    dataSent:
      'The same kinds of email content as Gemini when it stands in for Gemini; sender, subject and a body excerpt to classify incoming email for auto-replies; and the sender, subject and summary of an email, plus your category names, to match emails to categories (as embeddings).',
    purposes:
      'Backup for Gemini when it is unavailable, classifying email for auto-replies, and matching emails to your categories.',
    retentionAndTraining:
      'OpenAI states that API data is not used to train its models unless the customer opts in. Abuse-monitoring logs are kept for up to 30 days unless the law requires longer.',
    region: 'United States',
    terms: [
      { label: 'OpenAI API data controls', url: 'https://developers.openai.com/api/docs/guides/your-data' },
      { label: 'OpenAI business data privacy', url: 'https://openai.com/enterprise-privacy/' },
    ],
  },
  {
    name: 'Amazon Bedrock (Amazon Nova models, run by AWS)',
    dataSent:
      'Email content (sender, participants, subject, body and thread), your saved preferences and category names, and your search queries.',
    purposes:
      'Email summaries and action items, priority scoring when Jev is unsure or unavailable, deciding which emails need re-prioritising, search, phishing screening, contact classification and learning your preferences.',
    retentionAndTraining:
      'AWS states that Bedrock does not use your prompts or responses to train models and does not share them with model providers. AWS may keep them for a limited period to detect abuse, depending on the retention setting.',
    region:
      'Sydney, Australia, with Amazon’s Asia Pacific cross-region processing, which can route requests to other Asia Pacific countries',
    terms: [
      { label: 'Bedrock data protection', url: 'https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html' },
      { label: 'Bedrock data retention', url: 'https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html' },
    ],
  },
];

const ProviderTerms: React.FC<{ terms: AiProcessor['terms'] }> = ({ terms }) => (
  <>
    {terms.map((term, index) => (
      <React.Fragment key={term.url}>
        {index > 0 && ', '}
        <a href={term.url} target="_blank" rel="noopener noreferrer">
          {term.label}
        </a>
      </React.Fragment>
    ))}
  </>
);

const AiProcessorEntry: React.FC<{ processor: AiProcessor }> = ({ processor }) => (
  <>
    <LegalParagraph>
      <strong>{processor.name}</strong>
    </LegalParagraph>
    <LegalList
      items={[
        <>
          <strong>Data sent:</strong> {processor.dataSent}
        </>,
        <>
          <strong>Why:</strong> {processor.purposes}
        </>,
        <>
          <strong>Retention and training:</strong> {processor.retentionAndTraining}
        </>,
        <>
          <strong>Where:</strong> {processor.region}
        </>,
        <>
          <strong>Their terms:</strong> <ProviderTerms terms={processor.terms} />
        </>,
      ]}
    />
  </>
);

export const AiProcessorsContent: React.FC = () => (
  <>
    <LegalParagraph>
      These AI providers process your email on our behalf. We send each one only what a feature needs, at the time it
      runs. Email content is sent over encrypted connections, and these providers do not receive your email account
      credentials.
    </LegalParagraph>
    {AI_PROCESSORS.map(processor => (
      <AiProcessorEntry key={processor.name} processor={processor} />
    ))}
    <LegalParagraph>
      If you add your own OpenAI or Anthropic API key, requests that use it go to that provider under your own account
      and its terms.
    </LegalParagraph>
  </>
);

export const OutsideAustraliaContent: React.FC = () => (
  <>
    <LegalParagraph>
      BearlyMail is run from Australia, but some of your email content is processed outside Australia by the AI
      providers above. This happens because these providers run their AI services from their own data centres, and the
      features in section 5.1 cannot work without sending them the relevant email content. Where each provider processes
      it:
    </LegalParagraph>
    <LegalList
      items={AI_PROCESSORS.map(processor => (
        <>
          <strong>{processor.name}:</strong> {processor.region}
        </>
      ))}
    />
    <LegalParagraph>
      To protect your information, each provider handles it under its terms for business API customers, including
      the retention and no-training terms described in section 5.1. We send only what each feature needs, over encrypted
      connections. By accepting this policy, you acknowledge that your email content may be processed in these
      countries, where privacy laws may differ from Australia’s.
    </LegalParagraph>
  </>
);
