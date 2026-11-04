import { ExecutionContext, UnauthorizedException } from "@nestjs/common";

import { PAT_SCOPES } from "../constants/personal-access-tokens.constants";
import { PersonalAccessTokenGuard } from "./personal-access-token.guard";
import { PersonalAccessTokensService } from "./personal-access-tokens.service";

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
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

  it("sets req.user to the principal for a valid token", async () => {
    authenticate.mockResolvedValue(principal);
    const request: Record<string, unknown> = {
      headers: { authorization: "bearer bm_pat_good" },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual(principal);
  });
});
