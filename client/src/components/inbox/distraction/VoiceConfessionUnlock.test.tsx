import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { VoiceConfessionUnlock } from './VoiceConfessionUnlock';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
  }),
}));

const verifyDistractionPhrase = vi.fn();
vi.mock('api/verifyDistractionPhrase', () => ({
  verifyDistractionPhrase: (transcript: string) => verifyDistractionPhrase(transcript),
}));

// Controllable stand-in for the Web Speech API wrapper hook.
let speechState: {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  error: string | null;
};
const speechControls = { start: vi.fn(), stop: vi.fn(), reset: vi.fn() };
vi.mock('hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => ({ ...speechState, ...speechControls }),
}));

describe('VoiceConfessionUnlock', () => {
  beforeEach(() => {
    verifyDistractionPhrase.mockReset();
    speechControls.start.mockReset();
    speechControls.stop.mockReset();
    speechControls.reset.mockReset();
    speechState = { isSupported: true, isListening: false, transcript: '', error: null };
  });

  it('posts the transcript to the backend and unlocks when verified', async () => {
    verifyDistractionPhrase.mockResolvedValue(true);
    speechState.transcript = 'please distract me with new emails';
    const onUnlocked = vi.fn();

    render(<VoiceConfessionUnlock onUnlocked={onUnlocked} />);

    fireEvent.click(screen.getByTestId('distraction-voice-verify'));

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
    expect(verifyDistractionPhrase).toHaveBeenCalledWith('please distract me with new emails');
  });

  it('shows a rejection message and does not unlock when not verified', async () => {
    verifyDistractionPhrase.mockResolvedValue(false);
    speechState.transcript = 'the weather is nice';
    const onUnlocked = vi.fn();

    render(<VoiceConfessionUnlock onUnlocked={onUnlocked} />);
    fireEvent.click(screen.getByTestId('distraction-voice-verify'));

    await waitFor(() => expect(screen.getByText('inbox.distractionTax.voice.rejected')).toBeInTheDocument());
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it('renders a graceful fallback when speech recognition is unsupported', () => {
    speechState.isSupported = false;
    render(<VoiceConfessionUnlock onUnlocked={vi.fn()} />);

    expect(screen.getByTestId('distraction-voice-unsupported')).toBeInTheDocument();
    expect(screen.queryByTestId('distraction-voice-verify')).not.toBeInTheDocument();
  });
});
