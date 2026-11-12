/**
 * Pure helper functions extracted from EmailAccountsSection.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { theme } from 'theme/theme';
import type { ImapAccountSummary } from 'types/imap-account.types';

import {
  PROVIDER_APPLE_MAIL,
  PROVIDER_GMAIL,
  PROVIDER_IMAP,
  PROVIDER_OFFICE365,
  PROVIDER_ZOHO,
} from 'constants/strings';

export type EmailAccountProvider =
  | typeof PROVIDER_GMAIL
  | typeof PROVIDER_OFFICE365
  | typeof PROVIDER_ZOHO
  | typeof PROVIDER_APPLE_MAIL
  | typeof PROVIDER_IMAP;

export interface EmailAccount {
  id: string;
  email: string;
  name?: string;
  isPrimary?: boolean;
  provider: EmailAccountProvider;
  isSSO?: boolean;
  /** IMAP only: the server rejected the stored password. */
  needsRelogin?: boolean;
}

const PROVIDER_COLORS: Record<string, string> = {
  [PROVIDER_GMAIL]: '#EA4335',
  [PROVIDER_OFFICE365]: '#0078D4',
  [PROVIDER_ZOHO]: '#C8202F',
  [PROVIDER_APPLE_MAIL]: '#0070C9',
  [PROVIDER_IMAP]: '#475569',
};

const PROVIDER_NAMES: Record<string, string> = {
  [PROVIDER_GMAIL]: 'Gmail',
  [PROVIDER_OFFICE365]: 'Office 365',
  [PROVIDER_ZOHO]: 'Zoho Mail',
  [PROVIDER_APPLE_MAIL]: 'Apple Mail',
  [PROVIDER_IMAP]: 'Email',
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
  appleMailAccounts: Array<{ id: string; email: string; name?: string; isPrimary?: boolean }> = [],
  imapAccounts: ImapAccountSummary[] = []
): EmailAccount[] {
  return [
    ...googleAccounts.map(acc => ({ ...acc, provider: PROVIDER_GMAIL })),
    ...office365Accounts.map(acc => ({ ...acc, provider: PROVIDER_OFFICE365 })),
    ...zohoAccounts.map(acc => ({ ...acc, provider: PROVIDER_ZOHO })),
    ...appleMailAccounts.map(acc => ({ ...acc, provider: PROVIDER_APPLE_MAIL })),
    ...imapAccounts.map(acc => ({
      id: acc.id,
      email: acc.email,
      name: acc.name ?? undefined,
      isPrimary: acc.isPrimary,
      needsRelogin: acc.needsRelogin,
      provider: PROVIDER_IMAP,
    })),
  ];
}

/**
 * Whether the Disconnect action should be offered for a connected account.
 * Disconnecting is only allowed when another account is already connected;
 * removing the only account would leave BearlyMail with no email provider, so
 * the user must connect another account first or delete their BearlyMail
 * account instead.
 */
export function canDisconnectAccounts(totalAccounts: number): boolean {
  return totalAccounts > 1;
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
  if (provider === PROVIDER_IMAP) {
    return 'settings.imap.confirmDisconnect';
  }
  return 'settings.zoho.confirmDisconnect';
}
