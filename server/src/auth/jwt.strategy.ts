import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

import { MILLISECONDS } from "../constants/time-constants";
import { UsersService } from "../users/users.service";

interface JwtPayload {
  sub: string;
  email?: string;
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
