import axios from 'axios';
import type { OAuthProviderId } from 'types/imap-account.types';

import { API_URL } from 'config/api';
import { PROVIDER_GMAIL, PROVIDER_GOOGLE } from 'constants/strings';

/** Sends the browser to the provider's "Sign in with…" consent screen. */
export async function startOAuthConnect(provider: OAuthProviderId): Promise<void> {
  const endpoint = provider === PROVIDER_GMAIL ? PROVIDER_GOOGLE : provider;
  const response = await axios.get<{ url: string }>(`${API_URL}/${endpoint}-accounts/connect-url`);
  window.location.href = response.data.url;
}
