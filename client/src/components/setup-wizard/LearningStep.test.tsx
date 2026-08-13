import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import { LearningStep } from './LearningStep';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

// Keep the analysis poll inert and in its first ("sync") phase so the component
// renders the "Reading your recent emails" step whose count comes purely from the
// email-import-progress payload.
vi.mock('hooks/settings/useAnalysisProgress', () => ({
  useAnalysisProgress: () => ({
    analyzing: true,
    analyzeProgress: { show: true, progress: { current: 0, total: 100 }, error: null, isComplete: false },
    startAnalysis: vi.fn(),
  }),
}));

const noop = () => undefined;

describe('LearningStep — synced-email count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the real synced count from the email-import-progress payload', async () => {
    mockedAxios.get.mockResolvedValue({ data: { prioritizedCount: 25, isReady: false } });

    render(<LearningStep onComplete={noop} onBack={noop} isLoading={false} />);

    // Status line ("Syncing your recent emails… ({{count}} so far)") reflects the payload.
    expect(await screen.findByText(/setupWizard\.learning\.statusSync:.*"count":25/)).toBeInTheDocument();
  });

  it('does not stay stuck at 0 — updates the count as more emails are synced', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: { prioritizedCount: 0, isReady: false } })
      .mockResolvedValue({ data: { prioritizedCount: 40, isReady: false } });

    render(<LearningStep onComplete={noop} onBack={noop} isLoading={false} />);

    // First poll: mid-sync, nothing persisted yet.
    expect(await screen.findByText(/setupWizard\.learning\.statusSync:.*"count":0/)).toBeInTheDocument();

    // Subsequent poll (scheduled 2s later): the count climbs to reflect real progress.
    await waitFor(
      () => expect(screen.getByText(/setupWizard\.learning\.statusSync:.*"count":40/)).toBeInTheDocument(),
      { timeout: 4000 }
    );

    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('/onboarding/email-import-progress'));
  });
});
