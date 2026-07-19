/**
 * Pure helper functions extracted from EmailAccountsSection.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { theme } from 'theme/theme';

import { PROVIDER_APPLE_MAIL, PROVIDER_GMAIL, PROVIDER_OFFICE365, PROVIDER_ZOHO } from 'constants/strings';

export type EmailAccountProvider =
  | typeof PROVIDER_GMAIL
  | typeof PROVIDER_OFFICE365
  | typeof PROVIDER_ZOHO
  | typeof PROVIDER_APPLE_MAIL;

export interface EmailAccount {
  id: string;
  email: string;
  name?: string;
  isPrimary?: boolean;
  provider: EmailAccountProvider;
  isSSO?: boolean;
}

const PROVIDER_COLORS: Record<string, string> = {
  [PROVIDER_GMAIL]: '#EA4335',
  [PROVIDER_OFFICE365]: '#0078D4',
  [PROVIDER_ZOHO]: '#C8202F',
  [PROVIDER_APPLE_MAIL]: '#0070C9',
};

const PROVIDER_NAMES: Record<string, string> = {
  [PROVIDER_GMAIL]: 'Gmail',
  [PROVIDER_OFFICE365]: 'Office 365',
  [PROVIDER_ZOHO]: 'Zoho Mail',
  [PROVIDER_APPLE_MAIL]: 'Apple Mail',
};

export function getProviderColor(provider: string): string {
  return PROVIDER_COLORS[provider] || theme.colors.primary.main;
}

export function getProviderName(provider: string): string {
  return PROVIDER_NAMES[provider] || provider;
}

export function buildAllAccounts(
  googleAccounts: Array<{ id: string; email: string; name?: string; isPrimary?: boolean; isSSO?: boolean }>,
  office365Accounts: Array<{ id: string; email: string; name?: string; isPrimary?: boolean }>,
  zohoAccounts: Array<{ id: string; email: string; name?: string; isPrimary?: boolean }>,
  appleMailAccounts: Array<{ id: string; email: string; name?: string; isPrimary?: boolean }> = []
): EmailAccount[] {
  return [
    ...googleAccounts.map(acc => ({ ...acc, provider: PROVIDER_GMAIL })),
    ...office365Accounts.map(acc => ({ ...acc, provider: PROVIDER_OFFICE365 })),
    ...zohoAccounts.map(acc => ({ ...acc, provider: PROVIDER_ZOHO })),
    ...appleMailAccounts.map(acc => ({ ...acc, provider: PROVIDER_APPLE_MAIL })),
  ];
}

export function getDisconnectConfirmKey(provider: string): string {
  if (provider === PROVIDER_GMAIL) {
    return 'settings.gmail.confirmDisconnect';
  }
  if (provider === PROVIDER_OFFICE365) {
    return 'settings.office365.confirmDisconnect';
  }
  if (provider === PROVIDER_APPLE_MAIL) {
    return 'settings.appleMail.confirmDisconnect';
  }
  return 'settings.zoho.confirmDisconnect';
}
