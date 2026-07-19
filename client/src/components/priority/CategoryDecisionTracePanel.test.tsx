import React from 'react';
import { render, screen } from '@testing-library/react';

import type { CategoryDecisionTrace } from './CategoryDebugModal.types';
import { CategoryDecisionTracePanel } from './CategoryDecisionTracePanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? key,
  }),
}));

// Mirrors the screenshot bug: the local model picked a specific CI category but
// the GitHub bot-updates override re-routed the thread to "bot-created".
const overrideClobbersTrace: CategoryDecisionTrace = {
  decidedAt: '2026-06-28T00:00:00.000Z',
  source: 'local',
  finalCategory: null,
  finalCategoryId: 'bot-cat-id',
  steps: [
    {
      step: 'local-model',
      outcome: 'considered',
      category: 'CI/CD & QA Pipeline Failures',
      categoryId: 'ci-cat-id',
      detail: 'Local model confident: category "CI/CD & QA Pipeline Failures" (96%).',
    },
    {
      step: 'github-override',
      outcome: 'applied',
      category: 'Bot updates',
      categoryId: 'bot-cat-id',
      detail: 'GitHub signal matched "Bot updates" and overrode the pipeline category.',
    },
  ],
};

const emailCategories = [
  { id: 'ci-cat-id', name: 'CI/CD & QA Pipeline Failures' },
  { id: 'bot-cat-id', name: 'New GitHub issues (bot-created)' },
];

describe('CategoryDecisionTracePanel', () => {
  it('shows an empty note when there is no trace', () => {
    render(
      <CategoryDecisionTracePanel trace={null} emailCategories={emailCategories} />,
    );
    expect(
      screen.getByText('priority.categoryDebug.decisionTrace.empty'),
    ).toBeInTheDocument();
  });

  it('renders each step with its detail and resolves the final category by id', () => {
    render(
      <CategoryDecisionTracePanel
        trace={overrideClobbersTrace}
        emailCategories={emailCategories}
      />,
    );
    // Both step details render, so the override step is no longer invisible.
    expect(
      screen.getByText(/Local model confident: category "CI\/CD & QA Pipeline Failures"/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/GitHub signal matched "Bot updates" and overrode/),
    ).toBeInTheDocument();
    // Final category resolves from finalCategoryId via emailCategories.
    expect(
      screen.getByText('New GitHub issues (bot-created)'),
    ).toBeInTheDocument();
  });

  it('shows which email the decision was computed from, with a stale warning', () => {
    render(
      <CategoryDecisionTracePanel
        trace={{
          ...overrideClobbersTrace,
          analyzedEmail: {
            emailId: 'email-1',
            receivedAt: '2026-06-20T00:00:00.000Z',
            wasLatestInThread: false,
            threadEmailCount: 4,
            contentSource: 'ai-summary',
          },
        }}
        emailCategories={emailCategories}
      />,
    );
    expect(
      screen.getByText('priority.categoryDebug.decisionTrace.analyzedEmail'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('priority.categoryDebug.decisionTrace.analyzedEmailStale'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/priority\.categoryDebug\.decisionTrace\.contentSources\.ai-summary|ai-summary/),
    ).toBeInTheDocument();
  });

  it('does not warn when the analysed email was the latest at decision time', () => {
    render(
      <CategoryDecisionTracePanel
        trace={{
          ...overrideClobbersTrace,
          analyzedEmail: {
            emailId: 'email-1',
            receivedAt: '2026-06-20T00:00:00.000Z',
            wasLatestInThread: true,
            threadEmailCount: 4,
          },
        }}
        emailCategories={emailCategories}
      />,
    );
    expect(
      screen.queryByText('priority.categoryDebug.decisionTrace.analyzedEmailStale'),
    ).not.toBeInTheDocument();
  });
});
