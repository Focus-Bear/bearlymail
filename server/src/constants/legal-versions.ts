/**
 * Current Terms of Use / Privacy Policy versions. Users whose accepted version
 * differs are asked to accept again, so bump a version whenever its document's
 * wording changes materially. TERMS_VERSION / PRIVACY_VERSION env vars override.
 */
export const DEFAULT_LEGAL_VERSIONS = {
  TERMS: "1.0.0",
  // 1.1.0: names every AI provider that processes email content, including TypeSafe.
  PRIVACY: "1.1.0",
} as const;
