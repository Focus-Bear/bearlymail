import { ExecutionContext } from "@nestjs/common";
import { ThrottlerException, ThrottlerStorage } from "@nestjs/throttler";
import { ThrottlerStorageService } from "@nestjs/throttler/dist/throttler.service";

import { MCP_SERVER } from "../constants/mcp-server.constants";
import { McpRateLimitGuard } from "./mcp-rate-limit.guard";

function contextFor(userId: string) {
  const header = jest.fn();
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ user: { userId } }),
      getResponse: () => ({ header }),
    }),
  } as unknown as ExecutionContext;
  return { context, header };
}

describe("McpRateLimitGuard", () => {
  let storage: ThrottlerStorageService;
  let guard: McpRateLimitGuard;

  beforeEach(() => {
    storage = new ThrottlerStorageService();
    guard = new McpRateLimitGuard(storage as unknown as ThrottlerStorage);
  });

  afterEach(() => storage.onApplicationShutdown());

  async function useUpLimit(userId: string): Promise<void> {
    const { context } = contextFor(userId);
    for (let request = 0; request < MCP_SERVER.RATE_LIMIT; request++) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }
  }

  it("blocks a user past the limit and says when to retry", async () => {
    await useUpLimit("busy-user");
    const { context, header } = contextFor("busy-user");

    await expect(guard.canActivate(context)).rejects.toThrow(ThrottlerException);
    expect(header).toHaveBeenCalledWith("Retry-After", expect.any(String));
  });

  it("doesn't block other users when one uses up the limit", async () => {
    await useUpLimit("busy-user");

    await expect(
      guard.canActivate(contextFor("quiet-user").context),
    ).resolves.toBe(true);
  });
});
