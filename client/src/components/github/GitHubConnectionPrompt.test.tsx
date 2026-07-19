import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import { GitHubConnectionPrompt } from './GitHubConnectionPrompt';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('config/api', () => ({
  API_URL: 'http://localhost:3001',
}));

vi.mock('theme/theme', () => ({
  theme: {
    colors: {
      background: { paper: '#fff' },
      text: { primary: '#000', secondary: '#666' },
      primary: { main: '#007bff', dark: '#0056b3', contrast: '#fff' },
      border: { light: '#ddd' },
      common: { white: '#fff' },
    },
    borderRadius: { xl: '12px', md: '6px' },
    spacing: { lg: '16px', md: '12px', sm: '8px', xs: '4px' },
    shadows: { sm: '0 1px 3px rgba(0,0,0,0.1)' },
    typography: {
      fontSize: { lg: '18px', sm: '14px' },
      fontWeight: { semibold: 600, medium: 500 },
    },
  },
}));

vi.mock('constants/emojis', () => ({
  EMOJI_OCTOPUS: '🐙',
  EMOJI_LINK: '🔗',
}));

Object.defineProperty(window, 'location', {
  value: { href: '' },
  writable: true,
});

describe('GitHubConnectionPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
  });

  it('renders the connect button', () => {
    render(<GitHubConnectionPrompt />);
    expect(screen.getByText('github.connectionPrompt.title')).toBeInTheDocument();
    expect(screen.getByText(/github.connectionPrompt.connectButton/)).toBeInTheDocument();
  });

  it('initiates GitHub OAuth flow when connect button is clicked', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { token: 'test-token-123' } });

    render(<GitHubConnectionPrompt />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(window.location.href).toBe('http://localhost:3001/github/connect?token=test-token-123');
    });

    expect(mockedAxios.post).toHaveBeenCalledWith('http://localhost:3001/github/create-connect-token');
  });

  it('shows connecting state while API call is in progress', async () => {
    let resolvePromise: (value: unknown) => void;
    const pendingPromise = new Promise(resolve => {
      resolvePromise = resolve;
    });
    mockedAxios.post.mockReturnValueOnce(pendingPromise as ReturnType<typeof mockedAxios.post>);

    render(<GitHubConnectionPrompt />);

    const connectButton = screen.getByRole('button');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText(/github.connectionPrompt.connecting/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(connectButton).toBeDisabled();
    });

    // Clean up
    resolvePromise!({ data: { token: 'token' } });
  });

  it('shows error alert and re-enables button on API failure', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

    render(<GitHubConnectionPrompt />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('settings.githubConnectError');
    });
    await waitFor(() => {
      expect(screen.getByRole('button')).not.toBeDisabled();
    });
  });

  it('encodes the token in the redirect URL', async () => {
    const tokenWithSpecialChars = 'token+with/special=chars';
    mockedAxios.post.mockResolvedValueOnce({ data: { token: tokenWithSpecialChars } });

    render(<GitHubConnectionPrompt />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(window.location.href).toBe(
        `http://localhost:3001/github/connect?token=${encodeURIComponent(tokenWithSpecialChars)}`
      );
    });
  });
});
