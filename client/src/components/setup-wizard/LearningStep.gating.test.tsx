import React from 'react';
import { act, render, screen } from '@testing-library/react';
import axios from 'axios';

import { LearningStep } from './LearningStep';
import { CATEGORISATION_MAX_WAIT_MINUTES } from './useCategorisationProgress';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}));

// Learning (analysis + import) is finished, so only categorisation gates the inbox.
vi.mock('hooks/settings/useAnalysisProgress', () => ({
  useAnalysisProgress: () => ({
    analyzing: false,
    analyzeProgress: { show: true, progress: { current: 100, total: 100 }, error: null, isComplete: true },
    startAnalysis: vi.fn(),
  }),
}));

const MS_PER_MINUTE = 60_000;
const POLL_MS = 2000;
const noop = () => undefined;

let categorisation = { total: 67, categorised: 42 };

function mockApi() {
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (url.includes('/onboarding/categorisation-progress')) {
      return { data: categorisation };
    }
    if (url.includes('/onboarding/email-import-progress')) {
      return { data: { prioritizedCount: 67, isReady: true } };
    }
    return { data: [] };
  });
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function openInboxButton() {
  return screen.getByRole('button', { name: 'setupWizard.learning.openInbox' });
}

describe('LearningStep — categorisation gate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    categorisation = { total: 67, categorised: 42 };
    mockApi();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a sorting row with real counts and keeps "Open my inbox" disabled until all are categorised', async () => {
    render(<LearningStep onComplete={noop} onBack={noop} isLoading={false} />);
    await flush();

    // Both the header title and the fourth progress row name the sorting phase.
    expect(screen.getAllByText('setupWizard.learning.phaseCategorise')).toHaveLength(2);
    expect(screen.getByText('42 / 67')).toBeInTheDocument();
    expect(openInboxButton()).toBeDisabled();

    categorisation = { total: 67, categorised: 67 };
    await flush(POLL_MS);

    expect(openInboxButton()).toBeEnabled();
    expect(screen.getByText('setupWizard.learning.readyDetail')).toBeInTheDocument();
  });

  it('lets the user in after the max wait, with a note that the rest are still being sorted', async () => {
    render(<LearningStep onComplete={noop} onBack={noop} isLoading={false} />);
    await flush();
    expect(openInboxButton()).toBeDisabled();

    await flush(CATEGORISATION_MAX_WAIT_MINUTES * MS_PER_MINUTE);

    expect(openInboxButton()).toBeEnabled();
    expect(screen.getByText('setupWizard.learning.readyDetailStillSorting')).toBeInTheDocument();
  });

  it('stops polling categorisation once the inbox is sorted', async () => {
    categorisation = { total: 5, categorised: 5 };
    render(<LearningStep onComplete={noop} onBack={noop} isLoading={false} />);
    await flush();
    const categorisationCalls = () =>
      mockedAxios.get.mock.calls.filter(([url]) => String(url).includes('categorisation-progress')).length;
    const callsAfterReady = categorisationCalls();

    await flush(POLL_MS * 5);

    expect(categorisationCalls()).toBe(callsAfterReady);
  });
});
