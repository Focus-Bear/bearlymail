import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { UsersService } from "../users/users.service";
import { isMfaElevationFresh } from "./mfa-elevation";

const MFA_REQUIRED_MESSAGE =
  "Admin accounts require MFA. Please set up and verify MFA in Settings.";
const MFA_NOT_VERIFIED_MESSAGE =
  "MFA verification required. Please verify your authenticator code to access admin features.";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private usersService: UsersService,
    private auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;

    if (!userId) return false;

    const user = await this.usersService.findOne(userId);
    if (user?.isAdmin !== true) return false;

    // SAQ Q35 / GAP-2: All admin accounts must have TOTP MFA enabled and verified.
    if (!user.totpEnabled) {
      throw new ForbiddenException({
        error: "MFA_SETUP_REQUIRED",
        message: MFA_REQUIRED_MESSAGE,
      });
    }

    // The JWT must carry a *fresh* MFA elevation: mfaVerified: true AND a
    // mfaVerifiedAt within the recency window. The elevation deliberately expires
    // sooner than the session, so a stale one prompts re-verification here rather
    // than logging the user out of the whole app.
    if (
      !request.user?.mfaVerified ||
      !isMfaElevationFresh(request.user?.mfaVerifiedAt)
    ) {
      throw new ForbiddenException({
        error: "MFA_VERIFICATION_REQUIRED",
        message: MFA_NOT_VERIFIED_MESSAGE,
      });
    }

    // SAQ Q52 / GAP-12: record every successful admin authorization.
    // Fire-and-forget — AuditService swallows its own errors so a logging failure
    // never blocks the admin request.
    void this.auditService.log({
      userId,
      action: `${request.method} ${request.path}`,
      ipAddress: request.ip ?? null,
      userAgent: request.headers?.["user-agent"] ?? null,
      metadata: {
        params: request.params,
        query: request.query,
        body: request.body,
      },
    });

    return true;
  }
}
