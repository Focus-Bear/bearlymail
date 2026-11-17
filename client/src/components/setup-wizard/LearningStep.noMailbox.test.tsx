import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import axios from 'axios';

import { LearningStep } from './LearningStep';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

vi.mock('react-i18next', () => ({
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}));

const startAnalysis = vi.fn();
const joinOrStartAnalysis = vi.fn();
// With no mailbox the analysis fails straight away, which used to read as "stalled".
const analyzeProgress = { show: true, progress: null, error: 'No email provider connected', isComplete: false };

vi.mock('hooks/settings/useAnalysisProgress', () => ({
  useAnalysisProgress: () => ({ analyzing: false, analyzeProgress, startAnalysis, joinOrStartAnalysis }),
}));

const NO_MAILBOX_REFUSAL = { response: { status: 403, data: { error: 'EMAIL_PROVIDER_REQUIRED' } } };

function mockApi({ hasMailbox }: { hasMailbox: boolean }) {
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/emails/connected-accounts')) {
      if (!hasMailbox) {
        throw NO_MAILBOX_REFUSAL;
      }
      return { data: [] };
    }
    if (url.includes('/onboarding/email-import-progress')) {
      return { data: { prioritizedCount: 0, isReady: false } };
    }
    return { data: { total: 0, categorised: 0 } };
  });
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('LearningStep — no email account connected (#442)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('says no account is connected and offers to connect one instead of "Try again"', async () => {
    mockApi({ hasMailbox: false });
    const onComplete = vi.fn();
    render(<LearningStep onComplete={onComplete} onBack={() => undefined} isLoading={false} />);
    await flush();

    expect(screen.getByRole('alert')).toHaveTextContent('setupWizard.learning.noMailboxTitle');
    expect(screen.getByText('setupWizard.learning.noMailboxDetail')).toBeInTheDocument();
    expect(screen.queryByText('setupWizard.learning.stalledTitle')).not.toBeInTheDocument();
    expect(screen.getByTestId('connect-mailbox-button')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'setupWizard.learning.retry' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /setupWizard\.learning\.skipToInbox/ }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps the usual stalled message and retry when a mailbox is connected', async () => {
    mockApi({ hasMailbox: true });
    render(<LearningStep onComplete={() => undefined} onBack={() => undefined} isLoading={false} />);
    await flush();

    expect(screen.getByRole('alert')).toHaveTextContent('setupWizard.learning.stalledTitle');
    expect(screen.getByRole('button', { name: 'setupWizard.learning.retry' })).toBeInTheDocument();
    expect(screen.queryByTestId('connect-mailbox-button')).not.toBeInTheDocument();
  });
});
