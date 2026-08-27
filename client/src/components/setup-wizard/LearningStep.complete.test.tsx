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

// Analysis reports complete; combined with an isReady import payload this drives
// canFinish=true so the header shows its finished state.
vi.mock('hooks/settings/useAnalysisProgress', () => ({
  useAnalysisProgress: () => ({
    analyzing: false,
    analyzeProgress: { show: true, progress: { current: 100, total: 100 }, error: null, isComplete: true },
    startAnalysis: vi.fn(),
  }),
}));

const noop = () => undefined;

describe('LearningStep — completed state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces the spinner with a static completed badge once learning finishes', async () => {
    mockedAxios.get.mockResolvedValue({ data: { prioritizedCount: 100, isReady: true } });

    render(<LearningStep onComplete={noop} onBack={noop} isLoading={false} />);

    // The finished header ("We're ready when you are.") appears...
    expect(await screen.findByText('setupWizard.learning.readyTitle')).toBeInTheDocument();

    // ...and the animated spinner is gone, replaced by the static ✓ badge.
    await waitFor(() => expect(screen.getByTestId('learning-complete')).toBeInTheDocument());
    expect(screen.queryByTestId('learning-spinner')).not.toBeInTheDocument();
  });
});
