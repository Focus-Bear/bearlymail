/** Where the web app runs when nothing else is configured (local dev). */
export const DEFAULT_FRONTEND_BASE_URL = "http://localhost:3000";

/** Public origin of the web app, for redirects that land the user in it. */
export function resolveFrontendBaseUrl(): string {
  return (process.env.FRONTEND_URL || DEFAULT_FRONTEND_BASE_URL).replace(
    /\/+$/,
    "",
  );
}
