import { createHash } from "crypto";

import { PAT_SCOPES } from "../constants/personal-access-tokens.constants";
import { OAuthError } from "./oauth-error";
import {
  canRequestDrafts,
  parseRequestedScopes,
  resolveGrantedScopes,
} from "./oauth-scopes";
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
      PAT_SCOPES.MAIL_DRAFT,
      PAT_SCOPES.MAIL_SEND,
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
  const all = [
    PAT_SCOPES.MAIL_READ,
    PAT_SCOPES.MAIL_DRAFT,
    PAT_SCOPES.MAIL_SEND,
  ];

  it("grants read-only unless the user allowed drafting or sending", () => {
    expect(resolveGrantedScopes(all, { allowSend: false })).toEqual([
      PAT_SCOPES.MAIL_READ,
    ]);
    expect(
      resolveGrantedScopes(all, { allowDrafts: true, allowSend: false }),
    ).toEqual([PAT_SCOPES.MAIL_READ, PAT_SCOPES.MAIL_DRAFT]);
    expect(resolveGrantedScopes(all, { allowSend: true })).toEqual(all);
  });

  it("can grant drafting alone to a client that asked to send", () => {
    expect(
      resolveGrantedScopes([PAT_SCOPES.MAIL_READ, PAT_SCOPES.MAIL_SEND], {
        allowDrafts: true,
        allowSend: false,
      }),
    ).toEqual([PAT_SCOPES.MAIL_READ, PAT_SCOPES.MAIL_DRAFT]);
  });

  it("never grants drafting or sending the client didn't ask for", () => {
    expect(
      resolveGrantedScopes([PAT_SCOPES.MAIL_READ], {
        allowDrafts: true,
        allowSend: true,
      }),
    ).toEqual([PAT_SCOPES.MAIL_READ]);
    expect(
      resolveGrantedScopes([PAT_SCOPES.MAIL_READ, PAT_SCOPES.MAIL_DRAFT], {
        allowSend: true,
      }),
    ).toEqual([PAT_SCOPES.MAIL_READ, PAT_SCOPES.MAIL_DRAFT]);
  });
});

describe("canRequestDrafts", () => {
  it("is true when the client asked to draft or to send", () => {
    expect(canRequestDrafts([PAT_SCOPES.MAIL_READ])).toBe(false);
    expect(canRequestDrafts([PAT_SCOPES.MAIL_DRAFT])).toBe(true);
    expect(canRequestDrafts([PAT_SCOPES.MAIL_SEND])).toBe(true);
  });
});
