import { ExecutionContext, ForbiddenException } from "@nestjs/common";

import { TESTER_EMAIL, TesterOnlyGuard } from "./tester-only.guard";

function contextWithUser(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("TesterOnlyGuard", () => {
  const guard = new TesterOnlyGuard();

  it("allows the tester account", () => {
    expect(guard.canActivate(contextWithUser({ email: TESTER_EMAIL }))).toBe(
      true,
    );
  });

  it("forbids any other email", () => {
    expect(() =>
      guard.canActivate(contextWithUser({ email: "someone@else.com" })),
    ).toThrow(ForbiddenException);
  });

  it("forbids when there is no user", () => {
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
