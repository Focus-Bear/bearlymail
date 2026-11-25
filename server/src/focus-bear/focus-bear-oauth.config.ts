import {
  FOCUS_BEAR_OAUTH,
  FOCUS_BEAR_OAUTH_ENV,
} from "../constants/focus-bear.constants";
import { resolveBackendBaseUrl } from "../utils/backend-base-url.util";

export interface FocusBearOAuthConfig {
  /** `https://<domain>`, no trailing slash. */
  issuerOrigin: string;
  clientId: string;
  clientSecret: string;
  audience: string;
  scope: string;
  redirectUri: string;
}

const HTTPS_PREFIX = "https://";

const readEnv = (env: NodeJS.ProcessEnv, name: string): string =>
  env[name]?.trim() ?? "";

/** Accepts `auth.focusbear.io` or `https://auth.focusbear.io/`. */
const toIssuerOrigin = (domain: string): string =>
  domain.startsWith(HTTPS_PREFIX)
    ? new URL(domain).origin
    : `${HTTPS_PREFIX}${domain.replace(/\/+$/, "")}`;

/**
 * The Focus Bear OAuth app this deployment uses, or null when any required
 * value is missing: Settings then shows Connect as unavailable.
 */
export function readFocusBearOAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): FocusBearOAuthConfig | null {
  const domain = readEnv(env, FOCUS_BEAR_OAUTH_ENV.DOMAIN);
  const clientId = readEnv(env, FOCUS_BEAR_OAUTH_ENV.CLIENT_ID);
  const clientSecret = readEnv(env, FOCUS_BEAR_OAUTH_ENV.CLIENT_SECRET);
  const audience = readEnv(env, FOCUS_BEAR_OAUTH_ENV.AUDIENCE);
  if (!domain || !clientId || !clientSecret || !audience) {
    return null;
  }
  return {
    issuerOrigin: toIssuerOrigin(domain),
    clientId,
    clientSecret,
    audience,
    scope:
      readEnv(env, FOCUS_BEAR_OAUTH_ENV.SCOPE) ||
      FOCUS_BEAR_OAUTH.DEFAULT_SCOPE,
    redirectUri:
      readEnv(env, FOCUS_BEAR_OAUTH_ENV.REDIRECT_URI) ||
      `${resolveBackendBaseUrl()}${FOCUS_BEAR_OAUTH.CALLBACK_PATH}`,
  };
}
