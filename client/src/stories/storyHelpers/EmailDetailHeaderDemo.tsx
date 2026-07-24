/**
 * EmailDetailHeaderDemo — sample data and wrapper for EmailDetailHeader stories.
 *
 * EmailDetailHeaderView takes `t` as a prop (no I18nextProvider needed for its own
 * strings). The priority chip is the SAME shared inbox-list PriorityBadge that the
 * container injects; here it is wrapped in a scoped i18n instance + MemoryRouter +
 * mocked AuthContext so its click-popup renders exactly like production.
 */
import React, { useState } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import { Email, PriorityExplanation } from 'types/email';

import { EmailDetailHeaderView } from 'components/email-detail/EmailDetailHeaderView';
import { PriorityBadge } from 'components/inbox/header/PriorityBadge';
import { AuthContext } from 'contexts/AuthContext';

// ---------------------------------------------------------------------------
// Scoped i18n for the shared PriorityBadge + its click-popup
// ---------------------------------------------------------------------------

const badgeI18n = i18n.createInstance();
badgeI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  resources: {
    en: {
      translation: {
        'common.close': 'Close',
        'common.loading': 'Loading…',
        'email.calculating': 'Calculating…',
        'email.priorityCalculated': 'Priority calculated',
        'email.priorityUnavailable': 'Not prioritised',
        'email.priorityUnavailableHint': "Priority hasn't been calculated yet. Click to retry.",
        'priority.veryHigh': 'Very High',
        'priority.high': 'High',
        'priority.medium': 'Medium',
        'priority.low': 'Low',
        'priority.veryLow': 'Very Low',
        'emailDetail.priorityScore': 'Priority Score: {{score}}',
        'emailDetail.scoreBreakdown': 'Score Breakdown',
        'emailDetail.totalScore': 'Total Score',
        'priority.tooltip.correctPrioritization': 'Correct this prioritisation',
        'priority.tooltip.category': 'Category',
        'priority.tooltip.showCategoryExplanation': 'Show why this category was chosen',
        'priority.tooltip.editCategoryRule': 'Edit the rule that matched this category',
        'priority.tooltip.suggestedCategory': 'Suggested Category',
        'priority.tooltip.categorisedBy.label': 'Categorised by: <ruleLink>{{sourceLabel}}</ruleLink>',
        'priority.tooltip.categorisedBy.ai': 'AI priority model',
        'priority.tooltip.categorisedBy.rule': 'Deterministic rule',
        'priority.tooltip.categorisedBy.local': 'Local model',
        'priority.tooltip.categorisedBy.proto': 'Suggested category (pending promotion)',
        'priority.tooltip.categorisedBy.user': 'Your manual choice',
        'priority.categoryOverride.buttonTitle': 'Change category',
        'priority.categoryDebug.buttonTitle': 'Category debug',
      },
    },
  },
});

const mockAuthValue = {
  user: null,
  loading: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
};

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
} as unknown as PriorityExplanation;

// ---------------------------------------------------------------------------
// Minimal i18n translation function for the VIEW's own strings (subject, To/Cc…)
// ---------------------------------------------------------------------------

export const translate = (key: string): string => {
  const translations: Record<string, string> = {
    'emailDetail.viewContact': 'View contact',
    'emailDetail.emailCopied': 'Email copied!',
    'emailDetail.clickToCopyEmail': 'Click to copy email address',
    'emailDetail.toLabel': 'To:',
    'emailDetail.ccLabel': 'Cc:',
  };
  return translations[key] ?? key;
};

// ---------------------------------------------------------------------------
// Story priority-tooltip adapter (stateful open/close; data pre-seeded)
// ---------------------------------------------------------------------------

const noop = async () => {};

const useStoryPriorityTooltip = (email: Email, explanation: PriorityExplanation | null, initialOpen: boolean) => {
  const [open, setOpen] = useState(initialOpen);
  return {
    hoveredPriorityEmailId: open ? email.id : null,
    priorityExplanation: explanation,
    loadingPriorityExplanation: false,
    priorityExplanationError: false,
    togglePriorityTooltip: () => setOpen(prev => !prev),
    hidePriorityTooltip: () => setOpen(false),
    expeditePriorityCalculation: noop,
    retryPriorityExplanation: noop,
  };
};

const StoryPriorityBadge: React.FC<{ email: Email; explanation: PriorityExplanation | null; open: boolean }> = ({
  email,
  explanation,
  open,
}) => {
  const priorityTooltip = useStoryPriorityTooltip(email, explanation, open);
  return (
    <I18nextProvider i18n={badgeI18n}>
      {/* @ts-expect-error — partial auth mock is sufficient for isolation */}
      <AuthContext.Provider value={mockAuthValue}>
        <MemoryRouter>
          <PriorityBadge email={email} priorityTooltip={priorityTooltip} />
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nextProvider>
  );
};

// ---------------------------------------------------------------------------
// Demo wrapper
// ---------------------------------------------------------------------------

export interface HeaderDemoProps {
  hasPriorityData?: boolean;
  /** Opens the priority chip's click-popup on first render (for the popup screenshot). */
  popupOpen?: boolean;
  /** Overrides the sample email — used for the unresolved / calculating chip variants. */
  emailOverrides?: Partial<Email>;
}

export const HeaderDemo: React.FC<HeaderDemoProps> = ({
  hasPriorityData = true,
  popupOpen = false,
  emailOverrides,
}) => {
  const [copied, setCopied] = useState(false);
  const email = emailOverrides ? ({ ...SAMPLE_EMAIL, ...emailOverrides } as Email) : SAMPLE_EMAIL;
  const explanation = hasPriorityData ? SAMPLE_PRIORITY_EXPLANATION : null;

  return (
    <div style={{ maxWidth: 760, fontFamily: 'system-ui, sans-serif' }}>
      <EmailDetailHeaderView
        email={email}
        correspondent={SAMPLE_CORRESPONDENT}
        priorityBadge={<StoryPriorityBadge email={email} explanation={explanation} open={popupOpen} />}
        emailCopied={copied}
        onNavigateToContact={(_event, contactEmail) => console.log('Navigate to contact:', contactEmail)}
        onCopyEmail={() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          console.log('Email copied');
        }}
        t={translate}
      />
    </div>
  );
};
