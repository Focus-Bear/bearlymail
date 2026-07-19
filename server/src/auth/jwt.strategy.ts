import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Request } from "express";
import { ExtractJwt, Strategy } from "passport-jwt";

import { AUTH_CONSTANTS } from "../constants/auth-constants";
import { MILLISECONDS } from "../constants/time-constants";
import { UsersService } from "../users/users.service";

interface JwtPayload {
  sub: string;
  email?: string;
  /** Issued-at timestamp (seconds since epoch) — set automatically by JwtService.sign() */
  iat?: number;
  /**
   * Set to true in MFA-elevated tokens (after TOTP verification).
   * Required for access to admin endpoints (SAQ Q35 / GAP-2).
   */
  mfaVerified?: boolean;
  /**
   * Epoch-ms timestamp of the TOTP verification that produced this elevated
   * token. AdminGuard treats elevation as valid only within a recency window,
   * independent of the token's own (session-length) expiry.
   */
  mfaVerifiedAt?: number;
}

/**
 * Extracts the JWT from the HttpOnly cookie by parsing the raw Cookie header.
 * Does not require cookie-parser middleware. Returns null when the cookie is
 * absent so passport-jwt falls through to the next extractor.
 */
function extractFromCookie(req: Request): string | null {
  const cookieHeader = req?.headers?.cookie;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx > 0) {
      const name = part.slice(0, eqIdx).trim();
      if (name === AUTH_CONSTANTS.COOKIE_NAME) {
        return decodeURIComponent(part.slice(eqIdx + 1).trim());
      }
    }
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      // Dual-read: HttpOnly cookie first (browser clients), Bearer header as fallback
      // (API clients, mobile apps, backward-compat during transition). OWASP ASVS GAP-4.
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("JWT_SECRET"),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findOneForAuth(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }

    // Invalidate tokens that were issued before the user's last password change.
    // This satisfies OWASP ASVS requirements 3.3.1 and 3.3.2: logout and password
    // changes must invalidate existing session tokens.
    if (user.passwordChangedAt && Number.isFinite(payload.iat)) {
      const tokenIssuedAtMs = (payload.iat as number) * MILLISECONDS.SECOND;
      if (tokenIssuedAtMs < user.passwordChangedAt.getTime()) {
        throw new UnauthorizedException(
          "Session invalidated due to password change. Please log in again.",
        );
      }
    }

    // lastActivityAt is now included in the findOneForAuth SELECT — no extra DB query needed
    const lastActivity = user.lastActivityAt ?? null;
    const needsTouch =
      !lastActivity || Date.now() - lastActivity.getTime() > MILLISECONDS.HOUR;
    if (needsTouch) {
      // Fire-and-forget, but never silently: persistent failures here are an
      // early signal of DB trouble on the auth hot path.
      this.usersService.updateLastActivity(payload.sub).catch((error) => {
        this.logger.warn(
          `Failed to update lastActivityAt for user ${payload.sub}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }

    return {
      userId: user.id,
      email: user.email,
      mfaVerified: payload.mfaVerified === true,
      mfaVerifiedAt: payload.mfaVerifiedAt,
    };
  }
}
