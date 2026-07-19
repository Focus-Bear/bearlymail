/**
 * CategoryDebugTracePanel — the categorisation trace section shown inside CategoryDebugModal
 * after the admin clicks the refresh/deep-trace button.
 *
 * For static screenshots: `cd client && npm run build-storybook`, open `storybook-static/index.html`.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import type { CategorizationTrace } from 'components/priority/CategoryDebugModal.types';
import { CategoryDebugTracePanel } from 'components/priority/CategoryDebugTracePanel';

const meta: Meta<typeof CategoryDebugTracePanel> = {
  title: 'Priority/CategoryDebugTrace',
  component: CategoryDebugTracePanel,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof CategoryDebugTracePanel>;

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <I18nextProvider i18n={i18n}>
    <MemoryRouter>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>{children}</div>
    </MemoryRouter>
  </I18nextProvider>
);

const COMPOSITE_RULE_WINNING_TRACE: CategorizationTrace = {
  deterministicRules: {
    winningRule: {
      categoryName: 'Invoices',
      ruleId: 'c1',
      ruleType: null,
      ruleKind: 'composite',
    },
    evaluations: [
      {
        id: 'c1',
        ruleKind: 'composite',
        ruleType: null,
        categoryName: 'Invoices',
        pattern: '',
        subjectPrefix: null,
        isEnabled: true,
        hitCount: 12,
        patternMatches: true,
        isWinningRule: true,
        compositeDetail: {
          senderMatch: true,
          subjectMatch: true,
          bodyMatch: true,
          bodyMatchedPhrase: 'Amount due',
          senderMatchedValue: 'billing@acme.com',
          subjectMatchedValue: 'Invoice',
        },
      },
      {
        id: 'r1',
        ruleKind: 'legacy',
        ruleType: 'sender_domain',
        categoryName: 'Acme Corp',
        pattern: '@acme.com',
        subjectPrefix: null,
        isEnabled: true,
        hitCount: 25,
        patternMatches: true,
        isWinningRule: false,
      },
      {
        id: 'c2',
        ruleKind: 'composite',
        ruleType: null,
        categoryName: 'Newsletters',
        pattern: '',
        subjectPrefix: null,
        isEnabled: true,
        hitCount: 3,
        patternMatches: false,
        isWinningRule: false,
        compositeDetail: {
          senderMatch: false,
          subjectMatch: false,
          bodyMatch: false,
          bodyMatchedPhrase: null,
        },
      },
    ],
  },
  shortlist: {
    skipped: false,
    categoryNames: ['Invoices', 'Finance', 'Acme Corp'],
  },
  smartModel: {
    category: 'Invoices',
    categoryExplanation: 'Deterministic rule matched: billing sender with invoice subject line and payment body text.',
    categoryConfidence: 'HIGH',
    llmCategoryBeforeRuleOverride: 'Finance',
    llmExplanationBeforeRuleOverride: 'Email discusses financial matters and payment amounts.',
  },
  evaluatedEmail: {
    emailId: 'email-latest',
    isLatestInThread: true,
    evaluatedReceivedAt: '2026-06-01T09:00:00.000Z',
    latestReceivedAt: '2026-06-01T09:00:00.000Z',
    latestEmailId: 'email-latest',
    threadEmailCount: 1,
  },
};

const NO_RULE_MATCH_TRACE: CategorizationTrace = {
  deterministicRules: {
    winningRule: null,
    evaluations: [
      {
        id: 'r1',
        ruleKind: 'legacy',
        ruleType: 'sender_domain',
        categoryName: 'GitHub Notifications',
        pattern: '@github.com',
        subjectPrefix: null,
        isEnabled: true,
        hitCount: 42,
        patternMatches: false,
        isWinningRule: false,
      },
      {
        id: 'c1',
        ruleKind: 'composite',
        ruleType: null,
        categoryName: 'Invoices',
        pattern: '',
        subjectPrefix: null,
        isEnabled: true,
        hitCount: 7,
        patternMatches: false,
        isWinningRule: false,
        compositeDetail: {
          senderMatch: false,
          subjectMatch: false,
          bodyMatch: false,
          bodyMatchedPhrase: null,
        },
      },
    ],
  },
  shortlist: {
    skipped: false,
    categoryNames: ['Personal', 'Social', 'Travel'],
  },
  smartModel: {
    category: 'Personal',
    categoryExplanation: 'Casual personal email from a friend discussing weekend plans.',
    categoryConfidence: 'MEDIUM',
  },
  evaluatedEmail: {
    emailId: 'email-older',
    isLatestInThread: false,
    evaluatedReceivedAt: '2026-05-30T12:00:00.000Z',
    latestReceivedAt: '2026-05-31T16:30:00.000Z',
    latestEmailId: 'email-newest',
    threadEmailCount: 4,
  },
};

const SHORTLIST_ERROR_TRACE: CategorizationTrace = {
  deterministicRules: {
    winningRule: null,
    evaluations: [],
  },
  shortlist: {
    skipped: false,
    categoryNames: [],
    error: 'LLM timeout after 30s — falling back to full category list.',
  },
  smartModel: {
    category: 'Other',
    categoryExplanation: 'Could not narrow categories; defaulted to Other.',
    categoryConfidence: 'LOW',
  },
  evaluatedEmail: {
    emailId: 'email-only',
    isLatestInThread: true,
    evaluatedReceivedAt: '2026-06-01T08:00:00.000Z',
    latestReceivedAt: '2026-06-01T08:00:00.000Z',
    latestEmailId: 'email-only',
    threadEmailCount: 1,
  },
};

/** Composite rule wins — shows matched sender/subject/body with override info */
export const CompositeRuleWinning: Story = {
  render: () => (
    <Wrapper>
      <CategoryDebugTracePanel trace={COMPOSITE_RULE_WINNING_TRACE} />
    </Wrapper>
  ),
};

/** No deterministic rule matched — smart model decides */
export const NoRuleMatch: Story = {
  render: () => (
    <Wrapper>
      <CategoryDebugTracePanel trace={NO_RULE_MATCH_TRACE} />
    </Wrapper>
  ),
};

/** Shortlist error — fallback to full list */
export const ShortlistError: Story = {
  render: () => (
    <Wrapper>
      <CategoryDebugTracePanel trace={SHORTLIST_ERROR_TRACE} />
    </Wrapper>
  ),
};
