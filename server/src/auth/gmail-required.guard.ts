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
    // CI search fallback mode: skip the Gmail requirement so that E2E search
    // tests can run against the seeded local-DB data without a real Gmail
    // account.
    //
    // Two ways to activate:
    //  1. CI_SEARCH_FALLBACK=true  (explicit opt-in, e.g. per-step override)
    //  2. CI=true + NODE_ENV=test  (GitHub Actions job-level env — automatic)
    //
    // The second form allows the job-level env block to activate the fallback
    // without needing a per-step override, so both the server startup and the
    // E2E test step run with the Gmail guard bypassed.
    const isCiTestEnv =
      process.env.CI === "true" && process.env.NODE_ENV === "test";
    if (process.env.CI_SEARCH_FALLBACK === "true" || isCiTestEnv) {
      return true;
    }

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
