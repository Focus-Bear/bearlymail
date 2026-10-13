/** Where the API listens when nothing else is configured (local dev). */
export const DEFAULT_BACKEND_BASE_URL = "http://localhost:3001";

/**
 * Public origin of this API, for absolute URLs handed to third parties (OAuth
 * redirect URIs, tracking pixels). Prefers `BACKEND_URL`; falls back to the
 * origin of `GOOGLE_REDIRECT_URI`, which every deployment already sets to a URL
 * on this API; and finally to the local dev default.
 */
export function resolveBackendBaseUrl(): string {
  const configured = process.env.BACKEND_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.GOOGLE_REDIRECT_URI) {
    try {
      return new URL(process.env.GOOGLE_REDIRECT_URI).origin;
    } catch {
      // fall through to the localhost default
    }
  }
  return DEFAULT_BACKEND_BASE_URL;
}
