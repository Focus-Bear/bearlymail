/**
 * Current Terms of Use / Privacy Policy versions. Users whose accepted version
 * differs are asked to accept again, so bump a version whenever its document's
 * wording changes. TERMS_VERSION / PRIVACY_VERSION env vars override.
 */
export const DEFAULT_LEGAL_VERSIONS = {
  TERMS: "1.0.0",
  // 1.1.0: names every AI provider that processes email content, including TypeSafe.
  // 1.2.0: describes each AI processor and the processing done outside Australia.
  PRIVACY: "1.2.0",
} as const;

/**
 * The "what's changed" summary shown when an existing user is asked to accept
 * a new Privacy Policy version: a client i18n key per version. Add one with
 * every PRIVACY bump (a spec enforces it for the current version).
 */
export const PRIVACY_CHANGE_SUMMARY_KEYS: Readonly<Record<string, string>> = {
  "1.2.0": "consent.changeSummaries.privacy_1_2_0",
};
