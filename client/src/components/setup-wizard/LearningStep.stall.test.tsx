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
let analyzeProgress = {
  show: true,
  progress: null as { current: number; total: number } | null,
  error: null as string | null,
  isComplete: false,
};

vi.mock('hooks/settings/useAnalysisProgress', () => ({
  useAnalysisProgress: () => ({ analyzing: false, analyzeProgress, startAnalysis }),
}));

const IMPORT_TIMEOUT_MS = 5 * 60_000;

function mockApi() {
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (url.includes('/onboarding/categorisation-progress')) {
      return { data: { total: 250, categorised: 204 } };
    }
    if (url.includes('/onboarding/email-import-progress')) {
      return { data: { prioritizedCount: 258, isReady: true } };
    }
    return { data: [] };
  });
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('LearningStep — stalled analysis', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockApi();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a stalled message with retry and skip as soon as the analysis errors', async () => {
    analyzeProgress = { show: true, progress: null, error: 'Superseded by new analysis', isComplete: false };
    const onComplete = vi.fn();
    render(<LearningStep onComplete={onComplete} onBack={() => undefined} isLoading={false} />);
    await flush();

    expect(screen.getByRole('alert')).toHaveTextContent('setupWizard.learning.stalledTitle');
    expect(screen.getByText('setupWizard.learning.stalledDetailError')).toBeInTheDocument();
    expect(screen.queryByTestId('learning-spinner')).not.toBeInTheDocument();
    // The not-yet-started sorting row no longer shows counts beside an active first row.
    expect(screen.queryByText('204 / 250')).not.toBeInTheDocument();

    startAnalysis.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'setupWizard.learning.retry' }));
    expect(startAnalysis).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /setupWizard\.learning\.skipToInbox/ }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('times out an analysis that never finishes into the stalled state instead of claiming it is ready', async () => {
    analyzeProgress = { show: true, progress: { current: 10, total: 100 }, error: null, isComplete: false };
    render(<LearningStep onComplete={() => undefined} onBack={() => undefined} isLoading={false} />);
    await flush();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await flush(IMPORT_TIMEOUT_MS);

    expect(screen.getByText(/setupWizard\.learning\.stalledDetailTimeout:.*"minutes":5/)).toBeInTheDocument();
    expect(screen.queryByText('setupWizard.learning.readyTitle')).not.toBeInTheDocument();
  });

  it('restarts the max-wait clock on retry so a fresh run gets its full time', async () => {
    analyzeProgress = { show: true, progress: { current: 10, total: 100 }, error: null, isComplete: false };
    render(<LearningStep onComplete={() => undefined} onBack={() => undefined} isLoading={false} />);
    await flush(IMPORT_TIMEOUT_MS);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'setupWizard.learning.retry' }));
    await flush();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await flush(IMPORT_TIMEOUT_MS);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
