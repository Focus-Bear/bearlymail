import { ExecutionContext, UnauthorizedException } from "@nestjs/common";

import { PAT_SCOPES } from "../constants/personal-access-tokens.constants";
import {
  bearerTokenThrottleKey,
  PersonalAccessTokenGuard,
} from "./personal-access-token.guard";
import { PersonalAccessTokensService } from "./personal-access-tokens.service";

function contextFor(
  request: Record<string, unknown>,
  response: { setHeader: jest.Mock } = { setHeader: jest.fn() },
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe("PersonalAccessTokenGuard", () => {
  const principal = {
    userId: "user-1",
    tokenId: "token-1",
    scopes: [PAT_SCOPES.MAIL_READ],
  };
  let authenticate: jest.Mock;
  let guard: PersonalAccessTokenGuard;

  beforeEach(() => {
    authenticate = jest.fn().mockResolvedValue(null);
    guard = new PersonalAccessTokenGuard({
      authenticate,
    } as unknown as PersonalAccessTokensService);
  });

  it("rejects a request with no Authorization header", async () => {
    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("ignores the session cookie entirely", async () => {
    await expect(
      guard.canActivate(
        contextFor({ headers: { cookie: "access_token=some-jwt" } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a token the service does not recognise", async () => {
    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: "Bearer bm_pat_nope" } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authenticate).toHaveBeenCalledWith("bm_pat_nope");
  });

  it("challenges with the protected-resource metadata so clients can sign in", async () => {
    const response = { setHeader: jest.fn() };
    await expect(
      guard.canActivate(contextFor({ headers: {} }, response)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const [name, value] = response.setHeader.mock.calls[0];
    expect(name).toBe("WWW-Authenticate");
    expect(value).toMatch(
      /^Bearer resource_metadata="http:\/\/[^"]+\/\.well-known\/oauth-protected-resource\/mcp", scope="mail:read mail:send"$/,
    );
  });

  it("marks a rejected token as invalid_token in the challenge", async () => {
    const response = { setHeader: jest.fn() };
    await expect(
      guard.canActivate(
        contextFor(
          { headers: { authorization: "Bearer bm_oat_nope" } },
          response,
        ),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(response.setHeader.mock.calls[0][1]).toContain(
      'error="invalid_token"',
    );
  });

  it("sets req.user to the principal for a valid token", async () => {
    authenticate.mockResolvedValue(principal);
    const request: Record<string, unknown> = {
      headers: { authorization: "bearer bm_pat_good" },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual(principal);
  });
});

describe("bearerTokenThrottleKey", () => {
  it("keys BearlyMail tokens by hash, never by the raw secret", () => {
    const key = bearerTokenThrottleKey("Bearer bm_oat_secret");
    expect(key).toMatch(/^token:[0-9a-f]{64}$/);
    expect(key).not.toContain("secret");
    expect(bearerTokenThrottleKey("Bearer bm_pat_other")).not.toBe(key);
  });

  it("ignores missing headers and other bearer strings (JWTs)", () => {
    expect(bearerTokenThrottleKey(undefined)).toBeNull();
    expect(bearerTokenThrottleKey("Bearer eyJhbGciOi.jwt")).toBeNull();
  });
});
