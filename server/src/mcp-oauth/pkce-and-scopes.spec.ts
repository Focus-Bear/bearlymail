import { createHash } from "crypto";

import { PAT_SCOPES } from "../constants/personal-access-tokens.constants";
import { OAuthError } from "./oauth-error";
import { parseRequestedScopes, resolveGrantedScopes } from "./oauth-scopes";
import { isValidPkceVerifier } from "./pkce";

const VERIFIER = `${"a".repeat(43)}-._~`;
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

describe("isValidPkceVerifier", () => {
  it("accepts the verifier whose S256 hash is the challenge", () => {
    expect(isValidPkceVerifier(VERIFIER, CHALLENGE)).toBe(true);
  });

  it("rejects a different or malformed verifier", () => {
    expect(isValidPkceVerifier("b".repeat(43), CHALLENGE)).toBe(false);
    expect(isValidPkceVerifier("short", CHALLENGE)).toBe(false);
    expect(isValidPkceVerifier(`${"a".repeat(43)} space`, CHALLENGE)).toBe(
      false,
    );
  });
});

describe("parseRequestedScopes", () => {
  it("defaults to every scope when none is requested", () => {
    expect(parseRequestedScopes(undefined)).toEqual([
      PAT_SCOPES.MAIL_READ,
      PAT_SCOPES.MAIL_SEND,
      PAT_SCOPES.SETTINGS_WRITE,
    ]);
  });

  it("drops offline_access and unknown scopes", () => {
    expect(parseRequestedScopes("mail:read offline_access profile")).toEqual([
      PAT_SCOPES.MAIL_READ,
    ]);
  });

  it("refuses a request for only unknown scopes", () => {
    expect(() => parseRequestedScopes("admin")).toThrow(OAuthError);
  });
});

describe("resolveGrantedScopes", () => {
  const both = [PAT_SCOPES.MAIL_READ, PAT_SCOPES.MAIL_SEND];
  const all = [...both, PAT_SCOPES.SETTINGS_WRITE];

  it("grants read-only unless the user allowed sending", () => {
    expect(resolveGrantedScopes(both, { allowSend: false })).toEqual([
      PAT_SCOPES.MAIL_READ,
    ]);
    expect(resolveGrantedScopes(both, { allowSend: true })).toEqual(both);
  });

  it("never grants send the client didn't ask for", () => {
    expect(
      resolveGrantedScopes([PAT_SCOPES.MAIL_READ], { allowSend: true }),
    ).toEqual([PAT_SCOPES.MAIL_READ]);
  });

  it("grants settings:write only when asked for and ticked", () => {
    expect(
      resolveGrantedScopes(all, { allowSend: false, allowSettingsWrite: true }),
    ).toEqual([PAT_SCOPES.MAIL_READ, PAT_SCOPES.SETTINGS_WRITE]);
    expect(resolveGrantedScopes(all, { allowSend: true })).toEqual(both);
    expect(
      resolveGrantedScopes(both, {
        allowSend: false,
        allowSettingsWrite: true,
      }),
    ).toEqual([PAT_SCOPES.MAIL_READ]);
  });
});
