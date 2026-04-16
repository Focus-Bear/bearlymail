import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

import { MILLISECONDS } from "../constants/time-constants";
import { UsersService } from "../users/users.service";

interface JwtPayload {
  sub: string;
  email?: string;
  /** Issued-at timestamp (seconds since epoch) — set automatically by JwtService.sign() */
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET") || "your-secret-key",
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
      this.usersService.updateLastActivity(payload.sub).catch(() => {});
    }

    return { userId: user.id, email: user.email };
  }
}
