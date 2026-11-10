import { PROVIDER_GOOGLE, PROVIDER_MICROSOFT, PROVIDER_ZOHO } from 'constants/strings';

export type OAuthProvider = typeof PROVIDER_GOOGLE | typeof PROVIDER_MICROSOFT | typeof PROVIDER_ZOHO;

/** Brand names are not translated. */
export const OAUTH_PROVIDER_DISPLAY_NAMES: Record<OAuthProvider, string> = {
  [PROVIDER_GOOGLE]: 'Google',
  [PROVIDER_MICROSOFT]: 'Microsoft',
  [PROVIDER_ZOHO]: 'Zoho',
};

const PERMISSION_MAIL_READ = 'mailRead';
const PERMISSION_MAIL_READ_ONLY = 'mailReadOnly';
const PERMISSION_MAIL_SEND = 'mailSend';
const PERMISSION_CONTACTS = 'contacts';
const PERMISSION_STAY_CONNECTED = 'stayConnected';
const PERMISSION_PROFILE = 'profile';

export interface OAuthPermission {
  /** i18n id under `auth.permissions.items.<id>`. */
  id: string;
  icon: string;
  /**
   * The provider scopes this row explains. Must mirror the `scope` array in
   * server/src/auth/<provider>.strategy.ts — the consent screen lists exactly
   * those, so a row here that drifts from them misleads the user.
   */
  scopes: readonly string[];
}

// Google sign-in asks only to read. Changing the mailbox (archive, snooze,
// star…) and sending are asked for the first time the user does one; calendar
// and contacts from the scheduling card and the CRM.
const GOOGLE_PERMISSIONS: readonly OAuthPermission[] = [
  { id: PERMISSION_MAIL_READ_ONLY, icon: '📥', scopes: ['https://www.googleapis.com/auth/gmail.readonly'] },
  { id: PERMISSION_PROFILE, icon: '🙂', scopes: ['email', 'profile'] },
];

const MICROSOFT_PERMISSIONS: readonly OAuthPermission[] = [
  {
    id: PERMISSION_MAIL_READ,
    icon: '📥',
    scopes: ['https://graph.microsoft.com/Mail.Read', 'https://graph.microsoft.com/Mail.ReadWrite'],
  },
  { id: PERMISSION_MAIL_SEND, icon: '📤', scopes: ['https://graph.microsoft.com/Mail.Send'] },
  { id: PERMISSION_CONTACTS, icon: '👥', scopes: ['https://graph.microsoft.com/Contacts.Read'] },
  { id: PERMISSION_STAY_CONNECTED, icon: '🔄', scopes: ['offline_access'] },
  { id: PERMISSION_PROFILE, icon: '🙂', scopes: ['openid', 'profile', 'email', 'https://graph.microsoft.com/User.Read'] },
];

const ZOHO_PERMISSIONS: readonly OAuthPermission[] = [
  {
    id: PERMISSION_MAIL_READ,
    icon: '📥',
    scopes: [
      'ZohoMail.messages.READ',
      'ZohoMail.messages.UPDATE',
      'ZohoMail.folders.READ',
      'ZohoMail.folders.ALL',
      'ZohoMail.accounts.READ',
    ],
  },
  { id: PERMISSION_MAIL_SEND, icon: '📤', scopes: ['ZohoMail.messages.CREATE'] },
  { id: PERMISSION_PROFILE, icon: '🙂', scopes: ['aaaserver.profile.READ'] },
];

export const OAUTH_PERMISSIONS: Record<OAuthProvider, readonly OAuthPermission[]> = {
  [PROVIDER_GOOGLE]: GOOGLE_PERMISSIONS,
  [PROVIDER_MICROSOFT]: MICROSOFT_PERMISSIONS,
  [PROVIDER_ZOHO]: ZOHO_PERMISSIONS,
};

/**
 * Only Google's consent screen shows per-scope checkboxes and a time-limited
 * vs ongoing access choice, so only Google gets the "on the next screen" tips.
 */
export function hasConsentScreenTips(provider: OAuthProvider): boolean {
  return provider === PROVIDER_GOOGLE;
}

/**
 * Only Google sign-in starts read-only and asks for more on demand, so only
 * Google gets the "we'll ask before archiving or sending" note.
 */
export function asksForMailChangesLater(provider: OAuthProvider): boolean {
  return provider === PROVIDER_GOOGLE;
}
