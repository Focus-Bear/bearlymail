import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Request, Response } from "express";

import { MCP_SERVER } from "../constants/mcp-server.constants";
import { MS_PER_SECOND } from "../constants/time-constants";
import { PersonalAccessTokenGuard } from "../personal-access-tokens/personal-access-token.guard";

interface FailureRecord {
  count: number;
  resetAt: number;
}

/**
 * Authenticates `/mcp` with PersonalAccessTokenGuard and limits how often one
 * client address may fail. Successful requests are never counted here — many
 * users reach `/mcp` from the same addresses (their MCP client's servers), so
 * only failures are keyed by address; valid tokens have the per-user limit in
 * McpRateLimitGuard. While an address is over the limit its requests are
 * refused before the token is looked up.
 */
@Injectable()
export class McpAuthFailureGuard implements CanActivate {
  private readonly failures = new Map<string, FailureRecord>();

  constructor(private readonly tokenGuard: PersonalAccessTokenGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const address = http.getRequest<Request>().ip ?? "unknown";
    const now = Date.now();

    const record = this.failures.get(address);
    if (record && record.resetAt <= now) {
      this.failures.delete(address);
    } else if (record && record.count >= MCP_SERVER.AUTH_FAILURE_LIMIT) {
      http
        .getResponse<Response>()
        .header(
          "Retry-After",
          String(Math.ceil((record.resetAt - now) / MS_PER_SECOND)),
        );
      throw new HttpException(
        "Too many failed authentication attempts",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      return await this.tokenGuard.canActivate(context);
    } catch (error: unknown) {
      this.recordFailure(address, now);
      throw error;
    }
  }

  private recordFailure(address: string, now: number): void {
    const current = this.failures.get(address);
    if (current && current.resetAt > now) {
      current.count += 1;
      return;
    }
    if (this.failures.size >= MCP_SERVER.AUTH_FAILURE_MAX_TRACKED) {
      this.dropExpired(now);
    }
    if (this.failures.size >= MCP_SERVER.AUTH_FAILURE_MAX_TRACKED) {
      // Still full of live entries: drop the oldest so memory stays bounded.
      const oldest = this.failures.keys().next().value;
      if (oldest !== undefined) this.failures.delete(oldest);
    }
    this.failures.set(address, {
      count: 1,
      resetAt: now + MCP_SERVER.AUTH_FAILURE_WINDOW_MS,
    });
  }

  private dropExpired(now: number): void {
    for (const [address, record] of this.failures) {
      if (record.resetAt <= now) this.failures.delete(address);
    }
  }
}
