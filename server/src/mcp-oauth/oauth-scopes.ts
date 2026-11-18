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

/** The optional permissions the user picked on the consent screen. */
export interface ConsentScopeChoices {
  allowDrafts?: boolean;
  allowSend: boolean;
  allowSettingsWrite?: boolean;
}

/**
 * What the user granted on the consent screen. Read access is the base of
 * every connection; drafting, sending and editing categories/rules are each
 * added only when the client asked for them and the user picked them. A client
 * that asked to send may also be granted drafting alone, since that is the
 * narrower permission.
 */
export function resolveGrantedScopes(
  requested: readonly string[],
  choices: ConsentScopeChoices,
): PatScope[] {
  const optional: Array<[PatScope, boolean, boolean | undefined]> = [
    [
      PAT_SCOPES.MAIL_DRAFT,
      canRequestDrafts(requested),
      choices.allowDrafts || choices.allowSend,
    ],
    [
      PAT_SCOPES.MAIL_SEND,
      requested.includes(PAT_SCOPES.MAIL_SEND),
      choices.allowSend,
    ],
    [
      PAT_SCOPES.SETTINGS_WRITE,
      requested.includes(PAT_SCOPES.SETTINGS_WRITE),
      choices.allowSettingsWrite,
    ],
  ];
  const granted = optional
    .filter(([, wasRequested, isTicked]) => wasRequested && isTicked)
    .map(([scope]) => scope);
  return [PAT_SCOPES.MAIL_READ, ...granted];
}

/** Whether the consent screen may offer drafting for these requested scopes. */
export function canRequestDrafts(requested: readonly string[]): boolean {
  return (
    requested.includes(PAT_SCOPES.MAIL_DRAFT) ||
    requested.includes(PAT_SCOPES.MAIL_SEND)
  );
}
