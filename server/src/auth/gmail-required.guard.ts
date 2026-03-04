import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { UsersService } from "../users/users.service";

@Injectable()
export class GmailRequiredGuard implements CanActivate {
  constructor(
    private googleAccountsService: GoogleAccountsService,
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { user } = request;

    if (!user) {
      throw new UnauthorizedException("Authentication required");
    }

    // JWT strategy returns { userId, email }, not full user object
    const userId =
      (user as { userId?: string; id?: string }).userId ||
      (user as { userId?: string; id?: string }).id;

    if (!userId) {
      throw new UnauthorizedException("User ID not found");
    }

    // Check if user has Google accounts connected (new system)
    const hasGmailAccounts =
      await this.googleAccountsService.hasConnectedGmail(userId);

    // Also check legacy: if user has tokens directly on User entity
    const fullUser = await this.usersService.findOneWithTokens(userId);
    const hasLegacyGmail = !!fullUser?.googleCalendarAccessToken;

    if (!hasGmailAccounts && !hasLegacyGmail) {
      throw new UnauthorizedException(
        "Gmail account connection required. Please connect a Gmail account to continue.",
      );
    }

    return true;
  }
}
