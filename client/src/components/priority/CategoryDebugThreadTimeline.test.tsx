import React from 'react';
import { render, screen } from '@testing-library/react';

import type { CategoryDebugThreadEmail, CategoryDecisionAnalyzedEmail } from './CategoryDebugModal.types';
import { CategoryDebugThreadTimeline } from './CategoryDebugThreadTimeline';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px' },
    colors: {
      background: { subtle: '#f5f5f5' },
      text: { primary: '#111', secondary: '#666', tertiary: '#999' },
      border: { default: '#e0e0e0', light: '#eee' },
      primary: { main: '#1976d2' },
      warning: { main: '#ed6c02' },
    },
    borderRadius: { sm: '4px' },
    typography: {
      fontSize: { xs: '11px', sm: '12px' },
      fontWeight: { normal: 400, semibold: 600 },
    },
  },
}));

function makeEmail(overrides: Partial<CategoryDebugThreadEmail>): CategoryDebugThreadEmail {
  return {
    emailId: 'email-1',
    from: 'bao@noat.ca',
    fromName: 'bao ngoc',
    subject: 'Re: [Focus-Bear/web_dashboard] "+" button broken (#2246)',
    receivedAt: '2026-07-01T00:00:00.000Z',
    isDebugTarget: false,
    isLatest: false,
    ...overrides,
  };
}

describe('CategoryDebugThreadTimeline', () => {
  it('renders nothing for an empty thread', () => {
    const { container } = render(<CategoryDebugThreadTimeline threadEmails={[]} analyzedEmail={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one row per email with viewing and latest badges', () => {
    render(
      <CategoryDebugThreadTimeline
        threadEmails={[
          makeEmail({ emailId: 'email-1', isDebugTarget: true }),
          makeEmail({ emailId: 'email-2', subject: 'QA PASS v1.21.0', isLatest: true }),
        ]}
        analyzedEmail={null}
      />
    );

    expect(screen.getByText('priority.categoryDebug.threadTimeline.title')).toBeInTheDocument();
    expect(screen.getByText('priority.categoryDebug.threadTimeline.singleEmailNote')).toBeInTheDocument();
    expect(screen.getByText('QA PASS v1.21.0')).toBeInTheDocument();
    expect(screen.getByText('priority.categoryDebug.threadTimeline.badgeViewing')).toBeInTheDocument();
    expect(screen.getByText('priority.categoryDebug.threadTimeline.badgeLatest')).toBeInTheDocument();
  });

  it('marks the email the stored decision was computed from', () => {
    const analyzed: CategoryDecisionAnalyzedEmail = {
      emailId: 'email-1',
      receivedAt: '2026-07-01T00:00:00.000Z',
      wasLatestInThread: false,
      threadEmailCount: 2,
    };
    render(
      <CategoryDebugThreadTimeline
        threadEmails={[
          makeEmail({ emailId: 'email-1' }),
          makeEmail({ emailId: 'email-2', isLatest: true, isDebugTarget: true }),
        ]}
        analyzedEmail={analyzed}
      />
    );

    expect(screen.getByText('priority.categoryDebug.threadTimeline.badgeAnalyzed')).toBeInTheDocument();
  });

  it('warns when the analysed email is not in the timeline', () => {
    render(
      <CategoryDebugThreadTimeline
        threadEmails={[makeEmail({ emailId: 'email-2', isLatest: true, isDebugTarget: true })]}
        analyzedEmail={{ emailId: 'gone-email', receivedAt: null }}
      />
    );

    expect(screen.getByText('priority.categoryDebug.threadTimeline.analyzedEmailMissing')).toBeInTheDocument();
  });
});
