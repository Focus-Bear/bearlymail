/** When each policy's wording last changed (ISO dates); bump with every wording change. */
export const LEGAL_LAST_UPDATED = {
  PRIVACY_POLICY: '2026-11-05',
  TERMS_OF_USE: '2026-11-05',
} as const;

export const PRIVACY_CONTACT_EMAIL = 'privacy@bearlymail.com';

/** Must match the minimum age in the Terms of Use. */
export const MINIMUM_USER_AGE = 16;

export const GOOGLE_API_SERVICES_USER_DATA_POLICY_URL =
  'https://developers.google.com/terms/api-services-user-data-policy';

export const PRIVACY_REGULATOR_URLS = {
  AUSTRALIA_OAIC: 'https://www.oaic.gov.au',
  NEW_ZEALAND_OPC: 'https://www.privacy.org.nz',
  UK_ICO: 'https://ico.org.uk',
} as const;
