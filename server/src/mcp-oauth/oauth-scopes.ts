import { MCP_OAUTH, OAUTH_ERROR_CODES } from "../constants/mcp-oauth.constants";
import {
  ALL_PAT_SCOPES,
  PAT_SCOPES,
  PatScope,
} from "../constants/personal-access-tokens.constants";
import { isPatScope } from "../personal-access-tokens/personal-access-tokens.service";
import { OAuthError } from "./oauth-error";

/**
 * The scopes a client asked for. No `scope` means everything we offer (the
 * user narrows it on the consent screen); `offline_access` and unknown scopes
 * are dropped, and a request naming only unknown scopes is refused.
 */
export function parseRequestedScopes(scope: string | undefined): PatScope[] {
  const names = (scope ?? "")
    .split(/\s+/)
    .filter((name) => name && name !== MCP_OAUTH.OFFLINE_ACCESS_SCOPE);
  if (names.length === 0) return [...ALL_PAT_SCOPES];
  const known = [...new Set(names.filter(isPatScope))];
  if (known.length === 0) {
    throw new OAuthError(
      OAUTH_ERROR_CODES.INVALID_SCOPE,
      `Supported scopes: ${ALL_PAT_SCOPES.join(" ")}`,
    );
  }
  return known;
}

/** The optional permissions the user ticked on the consent screen. */
export interface ConsentScopeChoices {
  allowSend: boolean;
  allowSettingsWrite?: boolean;
}

/**
 * What the user granted on the consent screen. Read access is the base of
 * every connection; sending and editing categories/rules are each added only
 * when the client asked for that scope and the user ticked it.
 */
export function resolveGrantedScopes(
  requested: readonly string[],
  choices: ConsentScopeChoices,
): PatScope[] {
  const optional: Array<[PatScope, boolean | undefined]> = [
    [PAT_SCOPES.MAIL_SEND, choices.allowSend],
    [PAT_SCOPES.SETTINGS_WRITE, choices.allowSettingsWrite],
  ];
  const granted = optional
    .filter(([scope, isTicked]) => isTicked && requested.includes(scope))
    .map(([scope]) => scope);
  return [PAT_SCOPES.MAIL_READ, ...granted];
}
