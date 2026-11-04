import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";

import { HTTP_HEADERS } from "../constants/http-headers";
import { mcpBearerChallenge } from "../mcp-oauth/mcp-oauth-urls";
import {
  hasBearlyMailTokenPrefix,
  PatPrincipal,
  PersonalAccessTokensService,
} from "./personal-access-tokens.service";
import { hashTokenSecret } from "./token-secrets";

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;
const THROTTLE_KEY_PREFIX = "token:";

/** The bearer credential in an Authorization header, if there is one. */
export function extractBearerToken(
  authorization: string | undefined,
): string | null {
  return BEARER_PATTERN.exec(authorization ?? "")?.[1] ?? null;
}

/**
 * Rate-limit key for a request carrying a BearlyMail token. Token routes run
 * the throttler before the guard sets `req.user`, and `req.ip` is the load
 * balancer (no `trust proxy`), so without this every MCP client — all of
 * claude.ai included — would share one bucket.
 */
export function bearerTokenThrottleKey(
  authorization: string | undefined,
): string | null {
  const token = extractBearerToken(authorization);
  if (!token || !hasBearlyMailTokenPrefix(token)) return null;
  return THROTTLE_KEY_PREFIX + hashTokenSecret(token);
}

export interface PatAuthenticatedRequest extends Request {
  user: PatPrincipal;
}

/**
 * Authenticates a request by bearer token in the Authorization header: a
 * personal access token or an OAuth access token issued to Claude.
 *
 * Deliberately ignores the session cookie: a token-only route cannot be driven
 * by a logged-in browser tab, so it needs no CSRF protection. Sets `req.user`
 * with `userId`, which is what the per-user encryption interceptor keys on.
 * Every 401 carries the RFC 9728 `WWW-Authenticate` challenge, which is how an
 * MCP client (claude.ai) discovers where to sign the user in.
 */
@Injectable()
export class PersonalAccessTokenGuard implements CanActivate {
  constructor(private readonly tokensService: PersonalAccessTokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<PatAuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      response.setHeader(
        HTTP_HEADERS.WWW_AUTHENTICATE,
        mcpBearerChallenge(false),
      );
      throw new UnauthorizedException("Missing bearer token");
    }
    const principal = await this.tokensService.authenticate(token);
    if (!principal) {
      response.setHeader(
        HTTP_HEADERS.WWW_AUTHENTICATE,
        mcpBearerChallenge(true),
      );
      throw new UnauthorizedException("Invalid, expired or revoked token");
    }
    request.user = principal;
    return true;
  }
}
