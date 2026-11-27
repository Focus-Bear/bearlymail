import { HttpException, UnauthorizedException } from "@nestjs/common";

import { MCP_SERVER } from "../constants/mcp-server.constants";
import { McpAuthFailureGuard } from "./mcp-auth-failure.guard";

function contextFor(ip: string) {
  const header = jest.fn();
  return {
    header,
    context: {
      switchToHttp: () => ({
        getRequest: () => ({ ip }),
        getResponse: () => ({ header }),
      }),
    } as never,
  };
}

describe("McpAuthFailureGuard", () => {
  let tokenGuard: { canActivate: jest.Mock };
  let guard: McpAuthFailureGuard;

  beforeEach(() => {
    tokenGuard = { canActivate: jest.fn() };
    guard = new McpAuthFailureGuard(tokenGuard as never);
  });

  const failTimes = async (ip: string, times: number) => {
    tokenGuard.canActivate.mockRejectedValue(new UnauthorizedException());
    for (let attempt = 0; attempt < times; attempt++) {
      await expect(
        guard.canActivate(contextFor(ip).context),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
  };

  it("passes a valid token through", async () => {
    tokenGuard.canActivate.mockResolvedValue(true);

    await expect(
      guard.canActivate(contextFor("1.1.1.1").context),
    ).resolves.toBe(true);
  });

  it("answers 429 without checking the token once an address has failed too often", async () => {
    await failTimes("2.2.2.2", MCP_SERVER.AUTH_FAILURE_LIMIT);
    tokenGuard.canActivate.mockClear();
    const { context, header } = contextFor("2.2.2.2");

    const error = await guard
      .canActivate(context)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(header).toHaveBeenCalledWith("Retry-After", expect.any(String));
    expect(tokenGuard.canActivate).not.toHaveBeenCalled();
  });

  it("never counts successful requests, however many arrive from one address", async () => {
    tokenGuard.canActivate.mockResolvedValue(true);

    for (let call = 0; call < MCP_SERVER.AUTH_FAILURE_LIMIT * 3; call++) {
      await expect(
        guard.canActivate(contextFor("3.3.3.3").context),
      ).resolves.toBe(true);
    }
  });

  it("limits each address separately", async () => {
    await failTimes("4.4.4.4", MCP_SERVER.AUTH_FAILURE_LIMIT);
    tokenGuard.canActivate.mockResolvedValue(true);

    await expect(
      guard.canActivate(contextFor("5.5.5.5").context),
    ).resolves.toBe(true);
  });

  it("lets an address try again after the window", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    try {
      await failTimes("6.6.6.6", MCP_SERVER.AUTH_FAILURE_LIMIT);
      jest.advanceTimersByTime(MCP_SERVER.AUTH_FAILURE_WINDOW_MS + 1);
      tokenGuard.canActivate.mockResolvedValue(true);

      await expect(
        guard.canActivate(contextFor("6.6.6.6").context),
      ).resolves.toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
