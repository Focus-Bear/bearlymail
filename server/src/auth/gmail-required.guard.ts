import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { AppleMailAccountsService } from "../apple-mail-accounts/apple-mail-accounts.service";
import {
  BOOLEAN_STRING_VALUES,
  NODE_ENV_VALUES,
} from "../constants/domain-types";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { Office365AccountsService } from "../office365-accounts/office365-accounts.service";
import { UsersService } from "../users/users.service";
import { ZohoAccountsService } from "../zoho-accounts/zoho-accounts.service";

@Injectable()
export class EmailAccountRequiredGuard implements CanActivate {
  constructor(
    private googleAccountsService: GoogleAccountsService,
    private usersService: UsersService,
    private office365AccountsService: Office365AccountsService,
    private zohoAccountsService: ZohoAccountsService,
    private appleMailAccountsService: AppleMailAccountsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // CI search fallback mode: skip the email provider requirement so that
    // E2E search tests can run against the seeded local-DB data without a
    // real email account.
    //
    // Two ways to activate:
    //  1. CI_SEARCH_FALLBACK=true  (explicit opt-in, e.g. per-step override)
    //  2. CI=true + NODE_ENV=test  (GitHub Actions job-level env — automatic)
    const isCiTestEnv =
      process.env.CI === BOOLEAN_STRING_VALUES.TRUE &&
      process.env.NODE_ENV === NODE_ENV_VALUES.TEST;
    if (
      process.env.CI_SEARCH_FALLBACK === BOOLEAN_STRING_VALUES.TRUE ||
      isCiTestEnv
    ) {
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

    // Check all supported email providers
    const [hasGmailAccounts, hasOffice365, hasZoho, hasAppleMail] =
      await Promise.all([
        this.googleAccountsService.hasConnectedGmail(userId),
        this.office365AccountsService.hasConnectedOffice365(userId),
        this.zohoAccountsService.hasConnectedZoho(userId),
        this.appleMailAccountsService.hasConnectedAppleMail(userId),
      ]);

    // Also check legacy: if user has tokens directly on User entity
    const fullUser = await this.usersService.findOneWithTokens(userId);
    const hasLegacyGmail = !!fullUser?.googleCalendarAccessToken;

    if (
      !hasGmailAccounts &&
      !hasLegacyGmail &&
      !hasOffice365 &&
      !hasZoho &&
      !hasAppleMail
    ) {
      throw new UnauthorizedException(
        "Email account connection required. Please connect Gmail, Outlook, Zoho, or Apple Mail to continue.",
      );
    }

    return true;
  }
}
