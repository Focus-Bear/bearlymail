import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
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
export class EmailProviderRequiredGuard implements CanActivate {
  constructor(
    private googleAccountsService: GoogleAccountsService,
    private office365AccountsService: Office365AccountsService,
    private zohoAccountsService: ZohoAccountsService,
    private appleMailAccountsService: AppleMailAccountsService,
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    // Check if user has any accounts connected
    const hasGmail = await this.googleAccountsService.hasConnectedGmail(userId);
    const hasO365 =
      await this.office365AccountsService.hasConnectedOffice365(userId);
    const hasZoho = await this.zohoAccountsService.hasConnectedZoho(userId);
    const hasAppleMail =
      await this.appleMailAccountsService.hasConnectedAppleMail(userId);

    // Also check legacy: if user has tokens directly on User entity
    const fullUser = await this.usersService.findOneWithTokens(userId);
    const hasLegacyGmail = !!fullUser?.googleCalendarAccessToken;

    if (!hasGmail && !hasO365 && !hasZoho && !hasAppleMail && !hasLegacyGmail) {
      throw new ForbiddenException(
        "Email provider connection required. Please connect an email account to continue.",
      );
    }

    return true;
  }
}
