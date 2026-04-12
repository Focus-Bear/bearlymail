/**
 * EmailDetailHeaderDemo — stateful wrapper and sample data for EmailDetailHeader stories.
 * Manages copied/explanation state. EmailDetailHeaderView takes `t` as a prop so no
 * I18nextProvider is needed here — the translate function is inlined instead.
 */
import React, { useState } from 'react';
import { Email } from 'types/email';

import { EmailDetailHeaderView, PriorityExplanation } from 'components/email-detail/EmailDetailHeaderView';

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

export const SAMPLE_EMAIL: Email = {
  id: 'email-001',
  threadId: 'thread-001',
  from: 'alice@example.com',
  fromName: 'Alice Chen',
  subject: 'Re: Monash Grand Prix Event — Catering Confirmation Needed',
  to: 'jeremy@focusbear.io',
  cc: 'bob@example.com',
  body: '<p>Hi Jeremy, following up on the catering arrangements.</p>',
  date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  isRead: false,
  priorityScore: 45,
  starCount: 0,
  category: 'Action',
  senderContactId: 'contact-001',
} as unknown as Email;

export const SAMPLE_CORRESPONDENT = {
  name: 'Alice Chen',
  email: 'alice@example.com',
  timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
};

export const SAMPLE_PRIORITY_EXPLANATION: PriorityExplanation = {
  score: 45,
  breakdown: [
    { factor: 'Goal Alignment', value: 20, description: 'Directly related to event planning goal' },
    { factor: 'Urgency', value: 15, description: 'Deadline mentioned in email' },
    { factor: 'VIP Contact', value: 10, description: 'Frequent correspondent' },
  ],
  dimensions: {
    goalAlignment: { score: 80, reasons: ['Related to event planning'] },
    urgency: { score: 60, reasons: ['Has deadline'] },
  },
};

// ---------------------------------------------------------------------------
// Minimal i18n translation function (avoids I18nextProvider for prop-based `t`)
// ---------------------------------------------------------------------------

export const translate = (key: string, options?: Record<string, unknown>): string => {
  const translations: Record<string, string> = {
    'emailDetail.viewContact': 'View contact',
    'emailDetail.emailCopied': 'Email copied!',
    'emailDetail.clickToCopyEmail': 'Click to copy email address',
    'emailDetail.priorityScore': `Priority score: ${options?.score ?? ''}`,
    'emailDetail.clickToSeeScore': 'Click to see score breakdown',
    'emailDetail.scoreBreakdown': 'Score Breakdown',
    'emailDetail.goalAlignment': 'Goal Alignment',
    'emailDetail.totalScore': 'Total Score',
    'emailDetail.priorityBecause': 'priority because',
    'emailDetail.tweakRules': 'Tweak rules',
    'emailDetail.toLabel': 'To:',
    'emailDetail.ccLabel': 'Cc:',
    'emailDetail.sentiment.positive': 'Positive',
    'emailDetail.sentiment.negative': 'Negative',
    'emailDetail.sentiment.neutral': 'Neutral',
    'emailDetail.sentiment.label': 'Sentiment',
    'priority.high': 'High',
    'priority.medium': 'Medium',
    'priority.low': 'Low',
    'priority.veryLow': 'Very Low',
  };
  if (key === 'emailDetail.priorityScore' && options?.score !== undefined) {
    return `Priority score: ${options.score}`;
  }
  return translations[key] ?? key;
};

// ---------------------------------------------------------------------------
// Demo wrapper
// ---------------------------------------------------------------------------

export interface HeaderDemoProps {
  showPriorityExplanation?: boolean;
  hasPriorityData?: boolean;
  emailCopied?: boolean;
}

export const HeaderDemo: React.FC<HeaderDemoProps> = ({
  showPriorityExplanation = false,
  hasPriorityData = false,
  emailCopied: initialCopied = false,
}) => {
  const [copied, setCopied] = useState(initialCopied);
  const [showExplanation, setShowExplanation] = useState(showPriorityExplanation);

  return (
    <div style={{ maxWidth: 700, fontFamily: 'system-ui, sans-serif' }}>
      <EmailDetailHeaderView
        email={SAMPLE_EMAIL}
        correspondent={SAMPLE_CORRESPONDENT}
        priorityExplanation={hasPriorityData ? SAMPLE_PRIORITY_EXPLANATION : null}
        showPriorityExplanation={showExplanation}
        emailCopied={copied}
        onFetchPriorityExplanation={() => setShowExplanation(true)}
        onClosePriorityExplanation={() => setShowExplanation(false)}
        onNavigateToContact={(_event, email) => console.log('Navigate to contact:', email)}
        onCopyEmail={() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          console.log('Email copied');
        }}
        onNavigateToSettings={() => console.log('Navigate to /settings')}
        t={translate}
      />
    </div>
  );
};
