import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
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
 * before the token is checked, so it would key on the client IP, and clients
 * sharing an address (or one token used from many) would be limited wrongly.
 * Must come after PersonalAccessTokenGuard, which sets `req.user`.
 */
@Injectable()
export class McpRateLimitGuard implements CanActivate {
  constructor(
    @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<PatAuthenticatedRequest>();
    const { userId } = request.user;
    // A JSON-RPC batch is charged per message, so batching can't multiply
    // the allowance. Oversized batches are refused by the protocol service.
    const cost = Array.isArray(request.body)
      ? Math.min(
          Math.max(request.body.length, 1),
          MCP_SERVER.MAX_BATCH_MESSAGES,
        )
      : 1;
    for (let charged = 0; charged < cost; charged++) {
      const { isBlocked, timeToBlockExpire } = await this.storage.increment(
        `${THROTTLER_NAME}:${userId}`,
        MCP_SERVER.RATE_WINDOW_MS,
        MCP_SERVER.RATE_LIMIT,
        MCP_SERVER.RATE_WINDOW_MS,
        THROTTLER_NAME,
      );
      if (isBlocked) {
        http
          .getResponse<Response>()
          .header("Retry-After", String(timeToBlockExpire));
        throw new ThrottlerException();
      }
    }
    return true;
  }
}
