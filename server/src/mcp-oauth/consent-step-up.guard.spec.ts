import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { STEP_UP_TOKEN_HEADER } from "../auth/step-up.guard";
import { ConsentStepUpGuard } from "./consent-step-up.guard";

function contextFor(body: unknown, stepUpToken?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        body,
        user: { userId: "user-1" },
        headers: stepUpToken ? { [STEP_UP_TOKEN_HEADER]: stepUpToken } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("ConsentStepUpGuard", () => {
  const verify = jest.fn();
  const guard = new ConsentStepUpGuard({ verify } as unknown as JwtService);

  beforeEach(() => verify.mockReset());

  it("lets a user decline without a step-up", async () => {
    await expect(
      guard.canActivate(contextFor({ approve: false, allowSend: false })),
    ).resolves.toBe(true);
  });

  it.each([
    ["true", { approve: true, allowSend: true }],
    ["a string", { approve: "true" }],
    ["a missing value", {}],
    ["no body", undefined],
  ])("requires a step-up when approve is %s", async (_label, body) => {
    await expect(guard.canActivate(contextFor(body))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("lets an approval through with a valid step-up token", async () => {
    verify.mockReturnValue({ sub: "user-1", stepUp: true });

    await expect(
      guard.canActivate(contextFor({ approve: true }, "step-up-1")),
    ).resolves.toBe(true);
  });
});
