import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";

import {
  PatPrincipal,
  PersonalAccessTokensService,
} from "./personal-access-tokens.service";

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

export interface PatAuthenticatedRequest extends Request {
  user: PatPrincipal;
}

/**
 * Authenticates a request by personal access token in the Authorization header.
 *
 * Deliberately ignores the session cookie: a PAT-only route cannot be driven
 * by a logged-in browser tab, so it needs no CSRF protection. Sets `req.user`
 * with `userId`, which is what the per-user encryption interceptor keys on.
 */
@Injectable()
export class PersonalAccessTokenGuard implements CanActivate {
  constructor(private readonly tokensService: PersonalAccessTokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<PatAuthenticatedRequest>();
    const match = BEARER_PATTERN.exec(request.headers.authorization ?? "");
    if (!match) {
      throw new UnauthorizedException("Missing bearer token");
    }
    const principal = await this.tokensService.authenticate(match[1]);
    if (!principal) {
      throw new UnauthorizedException("Invalid, expired or revoked token");
    }
    request.user = principal;
    return true;
  }
}
