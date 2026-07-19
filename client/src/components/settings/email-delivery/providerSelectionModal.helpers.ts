/**
 * Pure helper functions extracted from ProviderSelectionModal.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */

export interface ProviderOption {
  id: 'gmail' | 'office365' | 'zoho' | 'apple-mail';
  name: string;
  description: string;
  color: string;
}

const COLOR_ERROR_GOOGLE = '#EA4335';
const COLOR_INFO_BLUE = '#0078D4';
const COLOR_ERROR_DARK_ALT = '#C8202F';
const COLOR_APPLE_BLUE = '#0070C9';

export function getProviderOptions(tFunc: (key: string) => string, includeAppleMail = false): ProviderOption[] {
  const options: ProviderOption[] = [
    {
      id: 'gmail' as const,
      name: 'Gmail',
      description: tFunc('settings.emailAccounts.providers.gmail.description'),
      color: COLOR_ERROR_GOOGLE,
    },
    {
      id: 'office365' as const,
      name: 'Office 365',
      description: tFunc('settings.emailAccounts.providers.office365.description'),
      color: COLOR_INFO_BLUE,
    },
    {
      id: 'zoho' as const,
      name: 'Zoho Mail',
      description: tFunc('settings.emailAccounts.providers.zoho.description'),
      color: COLOR_ERROR_DARK_ALT,
    },
  ];
  if (includeAppleMail) {
    options.push({
      id: 'apple-mail' as const,
      name: 'Apple Mail',
      description: tFunc('settings.emailAccounts.providers.appleMail.description'),
      color: COLOR_APPLE_BLUE,
    });
  }
  return options;
}
