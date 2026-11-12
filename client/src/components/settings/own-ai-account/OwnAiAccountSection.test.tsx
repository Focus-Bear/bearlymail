import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import { AI_PROVIDER_IDS, AI_PROVIDERS, SELF_HOSTING_DOCS_URL } from 'constants/ownAiAccount';
import type { AiKeyStatus } from 'hooks/settings/useOwnAiKeys';

import { OwnAiAccountSection } from './OwnAiAccountSection';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), isAxiosError: vi.fn() } }));
vi.mock('config/api', () => ({ API_URL: 'http://api.test' }));
vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ i18nKey, components }: { i18nKey: string; components: { selfHostLink: React.ReactElement } }) =>
    React.cloneElement(components.selfHostLink, {}, i18nKey),
}));

const KEYS_URL = 'http://api.test/llm/me/ai-keys';
const MASKED_OPENAI_KEY = 'sk-••••a1B2';

const noKeys = (): AiKeyStatus[] =>
  AI_PROVIDERS.map(provider => ({ provider: provider.id, hasKey: false, maskedKey: null, rejectedAt: null }));

const withOpenAiKey = (rejectedAt: string | null = null): AiKeyStatus[] =>
  noKeys().map(status =>
    status.provider === AI_PROVIDER_IDS.OPENAI
      ? { ...status, hasKey: true, maskedKey: MASKED_OPENAI_KEY, rejectedAt }
      : status
  );

function serveStatuses(providers: AiKeyStatus[]) {
  vi.mocked(axios.get).mockResolvedValue({ data: { providers } });
}

describe('OwnAiAccountSection', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.post).mockReset();
    vi.mocked(axios.isAxiosError).mockReset().mockReturnValue(true);
  });

  it('explains the section and links to self-hosting, with the key fields hidden', async () => {
    serveStatuses(noKeys());
    render(<OwnAiAccountSection />);

    await waitFor(() => expect(axios.get).toHaveBeenCalledWith(KEYS_URL));
    expect(screen.getByText('settings.ownAiAccount.title')).toBeInTheDocument();
    expect(screen.getByText('settings.ownAiAccount.why')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'settings.ownAiAccount.selfHost' })).toHaveAttribute(
      'href',
      SELF_HOSTING_DOCS_URL
    );
    expect(screen.queryByLabelText('settings.ownAiAccount.keyInputLabel')).not.toBeInTheDocument();
  });

  it('shows one row per provider once the user asks to use their own keys', async () => {
    serveStatuses(noKeys());
    render(<OwnAiAccountSection />);

    fireEvent.click(screen.getByRole('button', { name: 'settings.ownAiAccount.useMyKeys' }));

    for (const provider of AI_PROVIDERS) {
      expect(screen.getByTestId(`ai-provider-${provider.id}`)).toBeInTheDocument();
    }
    expect(screen.getAllByLabelText('settings.ownAiAccount.keyInputLabel')).toHaveLength(AI_PROVIDERS.length);
  });

  it('opens already expanded with a saved key shown only masked', async () => {
    serveStatuses(withOpenAiKey());
    render(<OwnAiAccountSection />);

    expect(await screen.findByText(MASKED_OPENAI_KEY)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'settings.ownAiAccount.useMyKeys' })).not.toBeInTheDocument();
  });

  it('warns when the provider rejected the saved key', async () => {
    serveStatuses(withOpenAiKey('2026-11-10T00:00:00Z'));
    render(<OwnAiAccountSection />);

    expect(await screen.findByText('settings.ownAiAccount.keyRejected')).toBeInTheDocument();
  });

  it('sends the key once to the provider endpoint and then shows the masked value', async () => {
    serveStatuses(noKeys());
    vi.mocked(axios.post).mockResolvedValue({ data: { providers: withOpenAiKey() } });
    render(<OwnAiAccountSection />);
    fireEvent.click(screen.getByRole('button', { name: 'settings.ownAiAccount.useMyKeys' }));

    const openAiRow = screen.getByTestId(`ai-provider-${AI_PROVIDER_IDS.OPENAI}`);
    const input = openAiRow.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-test-key-1234567890' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'settings.ownAiAccount.saveKey' })[0]);

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith(`${KEYS_URL}/${AI_PROVIDER_IDS.OPENAI}`, {
        key: 'sk-test-key-1234567890',
      })
    );
    expect(await screen.findByText(MASKED_OPENAI_KEY)).toBeInTheDocument();
  });

  it("shows the server's validation message when a key is refused", async () => {
    serveStatuses(noKeys());
    vi.mocked(axios.post).mockRejectedValue({ response: { data: { message: 'OpenAI rejected this API key' } } });
    render(<OwnAiAccountSection />);
    fireEvent.click(screen.getByRole('button', { name: 'settings.ownAiAccount.useMyKeys' }));

    const input = screen.getByTestId(`ai-provider-${AI_PROVIDER_IDS.OPENAI}`).querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-bad' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'settings.ownAiAccount.saveKey' })[0]);

    expect(await screen.findByText('OpenAI rejected this API key')).toBeInTheDocument();
  });
});
