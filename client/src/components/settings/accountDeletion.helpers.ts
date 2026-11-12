import type { EmailAccountProvider } from 'components/settings/email-delivery/emailAccounts.helpers';
import { PROVIDER_APPLE_MAIL, PROVIDER_GMAIL, PROVIDER_OFFICE365, PROVIDER_ZOHO } from 'constants/strings';

/**
 * The names people know their mailbox by. Office 365 mailboxes are read in
 * Outlook, so that is the name the reassurance uses. Generic IMAP accounts have
 * no brand to name and fall back to the provider-neutral wording.
 */
const MAILBOX_BRAND_NAMES: Partial<Record<EmailAccountProvider, string>> = {
  [PROVIDER_GMAIL]: 'Gmail',
  [PROVIDER_OFFICE365]: 'Outlook',
  [PROVIDER_ZOHO]: 'Zoho Mail',
  [PROVIDER_APPLE_MAIL]: 'Apple Mail',
};

/** Gmail label BearlyMail moves snoozed threads under (the server's snooze label name). */
export const GMAIL_SNOOZE_LABEL = 'SnoozedBearlyMail';

/** Snoozed threads the deletion could not put back in the inbox, from the DELETE /users/me response. */
export function getStillSnoozedThreads(responseData: unknown): number {
  const count = (responseData as { stillSnoozedThreads?: unknown } | null | undefined)?.stillSnoozedThreads;
  return typeof count === 'number' && count > 0 ? count : 0;
}

export const REASSURANCE_NAMED_KEY = 'settings.accountDeletion.providerReassurance';
export const REASSURANCE_GENERIC_KEY = 'settings.accountDeletion.providerReassuranceGeneric';

export interface ProviderReassurance {
  key: typeof REASSURANCE_NAMED_KEY | typeof REASSURANCE_GENERIC_KEY;
  /** Brand names, joined in the copy by i18next's locale-aware `list` formatter. */
  params?: { providers: string[]; count: number };
}

/**
 * Picks the "your emails stay in Gmail" reassurance for the delete-account
 * prompt. Deleting a BearlyMail account deletes BearlyMail's database rows
 * (UsersService.deleteAccount); the only provider call it makes is moving
 * snoozed threads back to the inbox, so no email is deleted from any provider. Names the connected providers when all of them have a
 * brand; otherwise (an IMAP account, or accounts not loaded yet) uses wording
 * that names none rather than leaving one mailbox out.
 */
export function getProviderReassurance(providers: EmailAccountProvider[]): ProviderReassurance {
  const brands = [...new Set(providers.map(provider => MAILBOX_BRAND_NAMES[provider]))];
  const hasUnbrandedProvider = brands.includes(undefined);
  const namedBrands = brands.filter((brand): brand is string => brand !== undefined);
  if (namedBrands.length === 0 || hasUnbrandedProvider) {
    return { key: REASSURANCE_GENERIC_KEY };
  }
  return { key: REASSURANCE_NAMED_KEY, params: { providers: namedBrands, count: namedBrands.length } };
}
