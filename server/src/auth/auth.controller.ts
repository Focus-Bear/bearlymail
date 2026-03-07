import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";

import { AUTH_CONSTANTS } from "../constants/auth-constants";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { Office365AccountsService } from "../office365-accounts/office365-accounts.service";
import { logError } from "../utils/logger";
import { WaitlistService } from "../waitlist/waitlist.service";
import { ZohoAccountsService } from "../zoho-accounts/zoho-accounts.service";
import { AuthService } from "./auth.service";
import { GoogleAuthGuard } from "./google-auth.guard";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { LocalAuthGuard } from "./local-auth.guard";
import { MicrosoftAuthGuard } from "./microsoft-auth.guard";
import { ZohoAuthGuard } from "./zoho-auth.guard";

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private googleAccountsService: GoogleAccountsService,
    private office365AccountsService: Office365AccountsService,
    private zohoAccountsService: ZohoAccountsService,
    private waitlistService: WaitlistService,
  ) {}

  @Post("register")
  async register(
    @Body() _body: { email: string; password: string; name?: string },
  ) {
    // Registration is disabled - users must join waitlist first
    throw new BadRequestException(
      "Registration is currently closed. Please join our waitlist first.",
    );
  }

  @Post("setup-password")
  async setupPassword(@Body() body: { token: string; password: string }) {
    return this.authService.setupPassword(body.token, body.password);
  }

  /**
   * Set password for an authenticated SSO user.
   * This allows users who logged in via Google/Microsoft/Zoho to also have a password.
   */
  @UseGuards(JwtAuthGuard)
  @Put("set-password")
  async setPassword(
    @Request() req,
    @Body() body: { password: string; confirmPassword: string },
  ) {
    if (!body.password || !body.confirmPassword) {
      throw new BadRequestException("Password and confirmation are required");
    }

    if (body.password !== body.confirmPassword) {
      throw new BadRequestException("Passwords do not match");
    }

    if (body.password.length < AUTH_CONSTANTS.MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        "Password must be at least 8 characters long",
      );
    }

    try {
      await this.authService.setPasswordForSsoUser(
        req.user.userId,
        body.password,
      );
      return { success: true, message: "Password set successfully" };
    } catch (error) {
      throw new BadRequestException(error.message || "Failed to set password");
    }
  }

  /**
   * Check if the authenticated user has a password set.
   */
  @UseGuards(JwtAuthGuard)
  @Get("has-password")
  async hasPassword(@Request() req) {
    const hasPassword = await this.authService.hasPassword(req.user.userId);
    return { hasPassword };
  }

  @UseGuards(LocalAuthGuard)
  @Post("login")
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Get("google")
  @UseGuards(GoogleAuthGuard)
  async googleAuth(@Request() _req) {}

  @Get("google/callback")
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(
    @Request() req,
    @Res() res,
    @Query("state") state?: string,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    if (req.authError || req.user?.authFailed) {
      return this.redirectWithAuthError(
        req.authError as Error,
        frontendUrl,
        res,
        "Google",
      );
    }
    if (state) {
      const handled = await this.handleGoogleConnectionState(
        state,
        req,
        res,
        frontendUrl,
      );
      if (handled) return;
    }
    const loginData = await this.authService.login(req.user);
    res.redirect(`${frontendUrl}/login?token=${loginData.access_token}`);
  }

  @Get("microsoft")
  @UseGuards(MicrosoftAuthGuard)
  async microsoftAuth(@Request() _req) {}

  @Get("microsoft/callback")
  @UseGuards(MicrosoftAuthGuard)
  async microsoftAuthRedirect(
    @Request() req,
    @Res() res,
    @Query("state") state?: string,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    if (req.authError || req.user?.authFailed) {
      return this.redirectWithAuthError(
        req.authError as Error,
        frontendUrl,
        res,
        "Microsoft",
      );
    }
    if (state) {
      const handled = await this.handleMicrosoftConnectionState(
        state,
        req,
        res,
        frontendUrl,
      );
      if (handled) return;
    }
    const loginData = await this.authService.login(req.user);
    res.redirect(`${frontendUrl}/login?token=${loginData.access_token}`);
  }

  @Get("zoho")
  @UseGuards(ZohoAuthGuard)
  async zohoAuth(@Request() _req) {}

  @Get("zoho/callback")
  @UseGuards(ZohoAuthGuard)
  async zohoAuthRedirect(
    @Request() req,
    @Res() res,
    @Query("state") state?: string,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    if (req.authError || req.user?.authFailed) {
      return this.redirectWithAuthError(
        req.authError as Error,
        frontendUrl,
        res,
        "Zoho",
      );
    }
    if (state) {
      const handled = await this.handleZohoConnectionState(
        state,
        req,
        res,
        frontendUrl,
      );
      if (handled) return;
    }
    const loginData = await this.authService.login(req.user);
    res.redirect(`${frontendUrl}/login?token=${loginData.access_token}`);
  }

  private determineOAuthErrorType(errorMessage: string): string {
    if (errorMessage.includes("pending approval")) return "pending_approval";
    if (
      errorMessage.includes("waitlist") ||
      errorMessage.includes("join the waitlist")
    ) {
      return "not_on_waitlist";
    }
    return "auth_error";
  }

  private redirectWithAuthError(
    error: Error,
    frontendUrl: string,
    res,
    providerName: string,
  ) {
    const errorMessage = error?.message || "Authentication failed";
    this.logger.warn(`${providerName} auth error: ${errorMessage}`);
    const errorType = this.determineOAuthErrorType(errorMessage);
    const errorParams = new URLSearchParams({
      error: "auth_failed",
      message: errorMessage,
      type: errorType,
    });
    return res.redirect(`${frontendUrl}/auth-error?${errorParams.toString()}`);
  }

  private parseOAuthState(
    state: string,
  ): { action: string; userId: string } | null {
    try {
      return JSON.parse(Buffer.from(state, "base64").toString());
    } catch {
      return null;
    }
  }

  private async handleGoogleConnectionState(
    state: string,
    req,
    res,
    frontendUrl: string,
  ): Promise<boolean> {
    const stateData = this.parseOAuthState(state);
    if (!stateData || stateData.action !== "connect" || !stateData.userId)
      return false;
    try {
      const googleUser = req.user as {
        googleProfile?: {
          id?: string;
          emails?: Array<{ value: string }>;
          displayName?: string;
        };
        googleAccessToken?: string;
        googleRefreshToken?: string;
        googleId?: string;
        googleCalendarAccessToken?: string;
        googleCalendarRefreshToken?: string;
        email?: string;
        name?: string;
      };
      const profile = googleUser.googleProfile;
      const accessToken =
        googleUser.googleAccessToken || googleUser.googleCalendarAccessToken;
      const refreshToken =
        googleUser.googleRefreshToken || googleUser.googleCalendarRefreshToken;
      const googleId = googleUser.googleId || profile?.id;
      const email = profile?.emails?.[0]?.value || googleUser.email;
      const name = profile?.displayName || googleUser.name || "";
      if (!googleId || !email || !accessToken || !refreshToken) return false;
      const existingAccounts = await this.googleAccountsService.findAllByUser(
        stateData.userId,
      );
      const accountExists = existingAccounts.find(
        (acc) => acc.googleId === googleId,
      );
      if (accountExists) {
        await this.googleAccountsService.updateTokens(
          accountExists.id,
          stateData.userId,
          accessToken,
          refreshToken,
        );
      } else {
        const isPrimary = existingAccounts.length === 0;
        await this.googleAccountsService.create({
          userId: stateData.userId,
          googleId,
          email,
          name,
          accessToken,
          refreshToken,
          isPrimary,
        });
      }
      res.redirect(`${frontendUrl}/settings?googleConnected=true`);
      return true;
    } catch (err) {
      logError(
        "Error parsing state in Google callback",
        err instanceof Error ? err : new Error(String(err)),
      );
      return false;
    }
  }

  private async handleMicrosoftConnectionState(
    state: string,
    req,
    res,
    frontendUrl: string,
  ): Promise<boolean> {
    const stateData = this.parseOAuthState(state);
    if (!stateData || stateData.action !== "connect" || !stateData.userId)
      return false;
    try {
      const microsoftUser = req.user as {
        microsoftProfile?: {
          id?: string;
          mail?: string;
          userPrincipalName?: string;
          displayName?: string;
        };
        microsoftAccessToken?: string;
        microsoftRefreshToken?: string;
        microsoftId?: string;
      };
      const profile = microsoftUser.microsoftProfile;
      const accessToken = microsoftUser.microsoftAccessToken;
      const refreshToken = microsoftUser.microsoftRefreshToken;
      const microsoftId = microsoftUser.microsoftId || profile?.id || "";
      const email = profile?.mail || profile?.userPrincipalName || "";
      const name = profile?.displayName || "";
      if (!microsoftId || !email || !accessToken || !refreshToken) return false;
      const existingAccounts =
        await this.office365AccountsService.findAllByUser(stateData.userId);
      const accountExists = existingAccounts.find(
        (acc) => acc.microsoftId === microsoftId,
      );
      if (accountExists) {
        await this.office365AccountsService.updateTokens(
          accountExists.id,
          stateData.userId,
          accessToken,
          refreshToken,
        );
      } else {
        const isPrimary = existingAccounts.length === 0;
        await this.office365AccountsService.create(
          stateData.userId,
          microsoftId,
          email,
          name,
          accessToken,
          refreshToken,
          isPrimary,
        );
      }
      res.redirect(`${frontendUrl}/settings?office365Connected=true`);
      return true;
    } catch (err) {
      logError(
        "Error parsing state in Microsoft callback",
        err instanceof Error ? err : new Error(String(err)),
      );
      return false;
    }
  }

  private async handleZohoConnectionState(
    state: string,
    req,
    res,
    frontendUrl: string,
  ): Promise<boolean> {
    const stateData = this.parseOAuthState(state);
    if (!stateData || stateData.action !== "connect" || !stateData.userId)
      return false;
    try {
      const zohoUser = req.user as {
        zohoProfile?: { ZUID?: string; Email?: string; Display_Name?: string };
        zohoAccessToken?: string;
        zohoRefreshToken?: string;
        zohoId?: string;
      };
      const profile = zohoUser.zohoProfile;
      const accessToken = zohoUser.zohoAccessToken;
      const refreshToken = zohoUser.zohoRefreshToken;
      const zohoId = zohoUser.zohoId || profile?.ZUID || "";
      const email = profile?.Email || "";
      const name = profile?.Display_Name || "";
      if (!zohoId || !email || !accessToken || !refreshToken) return false;
      const existingAccounts = await this.zohoAccountsService.findAllByUser(
        stateData.userId,
      );
      const accountExists = existingAccounts.find(
        (acc) => acc.zohoId === zohoId,
      );
      if (accountExists) {
        await this.zohoAccountsService.updateTokens(
          accountExists.id,
          stateData.userId,
          accessToken,
          refreshToken,
        );
      } else {
        const isPrimary = existingAccounts.length === 0;
        await this.zohoAccountsService.create({
          userId: stateData.userId,
          zohoId,
          email,
          name,
          accessToken,
          refreshToken,
          isPrimary,
        });
      }
      res.redirect(`${frontendUrl}/settings?zohoConnected=true`);
      return true;
    } catch (err) {
      logError(
        "Error parsing state in Zoho callback",
        err instanceof Error ? err : new Error(String(err)),
      );
      return false;
    }
  }
}
