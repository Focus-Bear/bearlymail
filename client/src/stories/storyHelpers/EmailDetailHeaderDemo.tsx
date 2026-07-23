/**
 * EmailDetailHeaderDemo — stateful wrapper and sample data for EmailDetailHeader stories.
 * Manages copied state. EmailDetailHeaderView takes `t` as a prop so no I18nextProvider
 * is needed here — the translate function is inlined instead.
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
  category: 'Sales',
  categorizationSource: 'ai',
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
  if (key === 'emailDetail.priorityScore' && options?.score !== undefined) {
    return `Priority Score: ${options.score}`;
  }
  if (key === 'emailDetail.priorityPanel.category' && options?.category !== undefined) {
    return `Category: ${options.category}`;
  }
  if (key === 'emailDetail.priorityPanel.categorisedBy' && options?.source !== undefined) {
    return `Categorised by ${options.source}`;
  }
  const translations: Record<string, string> = {
    'emailDetail.viewContact': 'View contact',
    'emailDetail.emailCopied': 'Email copied!',
    'emailDetail.clickToCopyEmail': 'Click to copy email address',
    'emailDetail.scoreBreakdown': 'Score Breakdown',
    'emailDetail.tweakRules': 'Tweak rules',
    'emailDetail.toLabel': 'To:',
    'emailDetail.ccLabel': 'Cc:',
    'emailDetail.priorityPanel.calculating': 'Priority: calculating…',
    'emailDetail.priorityPanel.notCalculated': 'Priority: not yet calculated',
    'emailDetail.priorityPanel.notCalculatedHint': 'This email was never scored — click to recalculate.',
    'emailDetail.priorityPanel.uncategorised': 'Uncategorised',
    'emailDetail.priorityPanel.breakdownLoading': 'Loading score breakdown…',
    'emailDetail.priorityPanel.noBreakdown': 'No score breakdown available',
    'priority.tooltip.categorisedBy.ai': 'AI priority model',
    'priority.tooltip.categorisedBy.rule': 'Deterministic rule',
    'priority.tooltip.categorisedBy.local': 'Local model',
    'priority.tooltip.categorisedBy.proto': 'Suggested category (pending promotion)',
    'priority.tooltip.categorisedBy.user': 'Your manual choice',
    'priority.veryHigh': 'Very High',
    'priority.high': 'High',
    'priority.medium': 'Medium',
    'priority.low': 'Low',
    'priority.veryLow': 'Very Low',
  };
  return translations[key] ?? key;
};

// ---------------------------------------------------------------------------
// Demo wrapper
// ---------------------------------------------------------------------------

export interface HeaderDemoProps {
  hasPriorityData?: boolean;
  emailCopied?: boolean;
  /** Overrides the sample email — used for the unresolved / calculating variants. */
  emailOverrides?: Partial<Email>;
}

export const HeaderDemo: React.FC<HeaderDemoProps> = ({
  hasPriorityData = true,
  emailCopied: initialCopied = false,
  emailOverrides,
}) => {
  const [copied, setCopied] = useState(initialCopied);
  const email = emailOverrides ? ({ ...SAMPLE_EMAIL, ...emailOverrides } as Email) : SAMPLE_EMAIL;

  return (
    <div style={{ maxWidth: 700, fontFamily: 'system-ui, sans-serif' }}>
      <EmailDetailHeaderView
        email={email}
        correspondent={SAMPLE_CORRESPONDENT}
        priorityExplanation={hasPriorityData ? SAMPLE_PRIORITY_EXPLANATION : null}
        emailCopied={copied}
        onFetchPriorityExplanation={() => console.log('Recalculate priority')}
        onNavigateToContact={(_event, contactEmail) => console.log('Navigate to contact:', contactEmail)}
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
