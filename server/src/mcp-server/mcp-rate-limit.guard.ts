import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";
import {
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerStorage,
} from "@nestjs/throttler";
import { Response } from "express";

import { MCP_SERVER } from "../constants/mcp-server.constants";
import { PatAuthenticatedRequest } from "../personal-access-tokens/personal-access-token.guard";

const THROTTLER_NAME = "mcp";

/**
 * The per-user limit on `/mcp`. It can't use the global throttler: that runs
 * before the token is checked, so it would key on `req.ip`, which is the load
 * balancer here, and one busy client would use up everyone's allowance. Must
 * come after PersonalAccessTokenGuard, which sets `req.user`.
 */
@Injectable()
export class McpRateLimitGuard implements CanActivate {
  constructor(
    @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const { userId } = http.getRequest<PatAuthenticatedRequest>().user;
    const { isBlocked, timeToBlockExpire } = await this.storage.increment(
      `${THROTTLER_NAME}:${userId}`,
      MCP_SERVER.RATE_WINDOW_MS,
      MCP_SERVER.RATE_LIMIT,
      MCP_SERVER.RATE_WINDOW_MS,
      THROTTLER_NAME,
    );
    if (isBlocked) {
      http.getResponse<Response>().header("Retry-After", String(timeToBlockExpire));
      throw new ThrottlerException();
    }
    return true;
  }
}
