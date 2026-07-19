import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Post,
  Put,
  Query,
  Request,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Response } from "express";
import type { PgBoss } from "pg-boss";

import { AUTH_CONSTANTS } from "../constants/auth-constants";
import { AUTH_ACTION_TYPES, NODE_ENV_VALUES } from "../constants/domain-types";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { Office365AccountsService } from "../office365-accounts/office365-accounts.service";
import { getJobPriority } from "../queue/job-priorities";
import { logError } from "../utils/logger";
import { ZohoAccountsService } from "../zoho-accounts/zoho-accounts.service";
import { AuthService } from "./auth.service";
import { GoogleAuthGuard } from "./google-auth.guard";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { jwtCookieOptions } from "./jwt-cookie.util";
import { LocalAuthGuard } from "./local-auth.guard";
import { isMfaElevationFresh } from "./mfa-elevation";
import { MicrosoftAuthGuard } from "./microsoft-auth.guard";
import { parseSignedOAuthState } from "./oauth-state.util";
import { ZohoAuthGuard } from "./zoho-auth.guard";

interface ZohoAuthUser {
  id: string;
  email?: string;
  name?: string;
  // The Zoho strategy emits ZUID (uppercase); Zuid kept for defensive compat.
  zohoProfile?: {
    ZUID?: string;
    Zuid?: string;
    Email: string;
    Display_Name?: string;
  };
  zohoAccessToken?: string;
  zohoRefreshToken?: string;
  zohoId?: string;
  accountsServer?: string;
}

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private googleAccountsService: GoogleAccountsService,
    private office365AccountsService: Office365AccountsService,
    private zohoAccountsService: ZohoAccountsService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
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

  /**
   * Clears the HttpOnly JWT cookie, effectively logging the user out on the server side.
   * The client should also clear any local state (Redux, React context) after calling this.
   */
  @Post("logout")
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_CONSTANTS.COOKIE_NAME);
    return { success: true };
  }

  @Post("setup-password")
  async setupPassword(
    @Body() body: { token: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const loginData = await this.authService.setupPassword(
      body.token,
      body.password,
    );
    const isProduction = process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION;
    res.cookie(
      AUTH_CONSTANTS.COOKIE_NAME,
      loginData.access_token,
      jwtCookieOptions(isProduction),
    );
    return loginData;
  }

  /**
   * Initiate the forgot-password flow.
   * Rate-limited to 3 requests per 5 minutes per IP to prevent abuse.
   * Always returns success — we never reveal whether the email is registered.
   */
  @Post("forgot-password")
  @Throttle({ default: { limit: 3, ttl: 300 } })
  async forgotPassword(@Body() body: { email: string }) {
    if (!body.email) {
      throw new BadRequestException("Email is required");
    }
    await this.authService.forgotPassword(body.email);
    return {
      success: true,
      message: "If that email is registered, a reset link has been sent.",
    };
  }

  /**
   * Complete the password-reset flow using the token from the reset email.
   * Validates the token, sets the new password, and sets the HttpOnly JWT cookie
   * so the frontend can transition the user to an authenticated state.
   */
  @Post("reset-password")
  async resetPassword(
    @Body() body: { token: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body.token || !body.password) {
      throw new BadRequestException("Token and password are required");
    }
    try {
      const loginData = await this.authService.resetPassword(
        body.token,
        body.password,
      );
      const isProduction = process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION;
      res.cookie(
        AUTH_CONSTANTS.COOKIE_NAME,
        loginData.access_token,
        jwtCookieOptions(isProduction),
      );
      return loginData;
    } catch (error) {
      throw new BadRequestException(
        error.message || "Failed to reset password",
      );
    }
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
        `Password must be at least ${AUTH_CONSTANTS.MIN_PASSWORD_LENGTH} characters long`,
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
   * Issue a short-lived step-up token after password re-verification.
   * The token must be included as X-Step-Up-Token on sensitive endpoints.
   * Rate-limited to 5 attempts per minute to prevent brute-force attacks.
   * (OWASP ASVS req 4.2.1)
   */
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60 } })
  @Post("step-up")
  async issueStepUpToken(
    @Request() req,
    @Body() body: { password?: string },
  ): Promise<{ step_up_token: string }> {
    const step_up_token = await this.authService.issueStepUpToken(
      req.user.userId,
      body.password,
    );
    return { step_up_token };
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

  // ─── MFA / TOTP endpoints ──────────────────────────────────────────────────

  /**
   * Initiate TOTP MFA setup. Returns the secret and a QR-code data URL.
   * The secret is saved but MFA is not yet active until mfa/enable is called.
   */
  @UseGuards(JwtAuthGuard)
  @Post("mfa/setup")
  async mfaSetup(@Request() req) {
    try {
      return await this.authService.setupMfa(req.user.userId);
    } catch (error) {
      throw new BadRequestException(
        error.message || "Failed to initiate MFA setup",
      );
    }
  }

  /**
   * Confirm MFA setup by verifying the first TOTP code.
   * On success MFA becomes active for the account.
   */
  @UseGuards(JwtAuthGuard)
  @Post("mfa/enable")
  async mfaEnable(@Request() req, @Body() body: { token: string }) {
    if (!body.token) throw new BadRequestException("Token is required");
    const ok = await this.authService.enableMfa(req.user.userId, body.token);
    if (!ok)
      throw new BadRequestException("Invalid TOTP code. Please try again.");
    return { success: true, message: "MFA enabled successfully" };
  }

  /**
   * Verify a TOTP code and receive an MFA-elevated JWT (8-hour expiry).
   * This elevated token satisfies the AdminGuard MFA check (SAQ Q35 / GAP-2).
   * The elevated token is set as an HttpOnly cookie (replacing the regular session
   * cookie) so that subsequent admin requests are automatically authenticated.
   * Rate-limited to 10 attempts per minute to prevent brute-force.
   */
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @Post("mfa/verify")
  async mfaVerify(
    @Request() req,
    @Body() body: { token: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body.token) throw new BadRequestException("Token is required");
    const result = await this.authService.verifyMfaAndElevate(
      req.user.userId,
      req.user.email,
      body.token,
    );
    if (!result) throw new UnauthorizedException("Invalid TOTP code");
    const isProduction = process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION;
    // The elevated token keeps the normal 7d session lifetime; MFA elevation is
    // enforced as a recency window by AdminGuard, so we must NOT shorten the
    // cookie to the elevation TTL (that was the cause of admins being logged out
    // every few hours).
    res.cookie(
      AUTH_CONSTANTS.COOKIE_NAME,
      result.access_token,
      jwtCookieOptions(isProduction),
    );
    return result;
  }

  /**
   * Disable MFA for the authenticated user.
   * Requires verification of the current TOTP code.
   */
  @UseGuards(JwtAuthGuard)
  @Delete("mfa")
  async mfaDisable(@Request() req, @Body() body: { token: string }) {
    if (!body.token) throw new BadRequestException("Token is required");
    const ok = await this.authService.disableMfa(req.user.userId, body.token);
    if (!ok)
      throw new BadRequestException("Invalid TOTP code. Please try again.");
    return { success: true, message: "MFA disabled successfully" };
  }

  /**
   * Return the MFA status for the currently authenticated user.
   * `verified` reflects whether the session carries a *fresh* MFA elevation
   * (verified AND within the recency window), so the admin UI prompts for
   * re-verification on entry once an elevation goes stale rather than waiting
   * for an admin endpoint to 403.
   */
  @UseGuards(JwtAuthGuard)
  @Get("mfa/status")
  async mfaStatus(@Request() req) {
    const status = await this.authService.getMfaStatus(req.user.userId);
    const verified =
      req.user.mfaVerified === true &&
      isMfaElevationFresh(req.user.mfaVerifiedAt);
    return { ...status, verified };
  }

  @UseGuards(LocalAuthGuard)
  @Post("login")
  async login(@Request() req, @Res({ passthrough: true }) res: Response) {
    const loginData = await this.authService.login(req.user);
    const isProduction = process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION;
    res.cookie(
      AUTH_CONSTANTS.COOKIE_NAME,
      loginData.access_token,
      jwtCookieOptions(isProduction),
    );
    return loginData;
  }

  @Get("google")
  @UseGuards(GoogleAuthGuard)
  async googleAuth(@Request() _req) {}

  @Get("google/callback")
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(
    @Request() req,
    @Res() res: Response,
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
    const isProduction = process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION;
    // Set HttpOnly cookie — token is never exposed to JavaScript (OWASP ASVS GAP-4)
    res.cookie(
      AUTH_CONSTANTS.COOKIE_NAME,
      loginData.access_token,
      jwtCookieOptions(isProduction),
    );
    res.redirect(`${frontendUrl}/inbox`);
  }

  @Get("microsoft")
  @UseGuards(MicrosoftAuthGuard)
  async microsoftAuth(@Request() _req) {}

  @Get("microsoft/callback")
  @UseGuards(MicrosoftAuthGuard)
  async microsoftAuthRedirect(
    @Request() req,
    @Res() res: Response,
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
    // Save Office365Account for direct Microsoft login (no connect state)
    await this.saveMicrosoftAccountForUser(req.user);
    const isProduction = process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION;
    res.cookie(
      AUTH_CONSTANTS.COOKIE_NAME,
      loginData.access_token,
      jwtCookieOptions(isProduction),
    );
    res.redirect(`${frontendUrl}/inbox`);
  }

  @Get("zoho")
  @UseGuards(ZohoAuthGuard)
  async zohoAuth(@Request() _req) {}

  @Get("zoho/callback")
  @UseGuards(ZohoAuthGuard)
  async zohoAuthRedirect(
    @Request() req,
    @Res() res: Response,
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

    // Save tokens during standard login
    const zohoUser = req.user as ZohoAuthUser;
    const zProfile = zohoUser.zohoProfile;
    const zAccessToken = zohoUser.zohoAccessToken;
    const zRefreshToken = zohoUser.zohoRefreshToken;
    const zohoId = zohoUser.zohoId || zProfile?.ZUID || zProfile?.Zuid;
    const zEmail = zProfile?.Email || zohoUser.email;
    const zName = zProfile?.Display_Name || zohoUser.name || "";
    const zAccountsServer = zohoUser.accountsServer;

    // Check for missing required fields before proceeding
    const missingFields = [
      !zohoUser.id && "userId",
      !zohoId && "zohoId",
      !zAccessToken && "accessToken",
      !zEmail && "email",
      !zAccountsServer && "accountsServer",
    ].filter(Boolean);

    if (missingFields.length > 0) {
      this.logger.warn(
        `[Zoho] Incomplete account data — missing fields: ${missingFields.join(", ")}`,
      );
      return this.redirectWithAuthError(
        new Error(
          `Incomplete Zoho profile received. Missing: ${missingFields.join(", ")}`,
        ),
        frontendUrl,
        res,
        "Zoho",
      );
    }

    // All required fields present — proceed with upsert
    const existingAccounts = await this.zohoAccountsService.findAllByUser(
      zohoUser.id,
    );
    const accountExists = existingAccounts.find((acc) => acc.zohoId === zohoId);

    if (accountExists) {
      await this.zohoAccountsService.updateTokens(
        accountExists.id,
        zohoUser.id,
        zAccessToken,
        zRefreshToken,
        zAccountsServer,
      );
    } else {
      await this.zohoAccountsService.create({
        userId: zohoUser.id,
        zohoId,
        email: zEmail,
        name: zName,
        accessToken: zAccessToken,
        refreshToken: zRefreshToken,
        // Non-null: missingFields check above guarantees accountsServer is set.
        accountsServer: zAccountsServer as string,
        isPrimary: existingAccounts.length === 0,
      });
    }
    const loginData = await this.authService.login(req.user);
    const isProduction = process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION;
    res.cookie(
      AUTH_CONSTANTS.COOKIE_NAME,
      loginData.access_token,
      jwtCookieOptions(isProduction),
    );
    res.redirect(`${frontendUrl}/inbox`);
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

  /**
   * A connect-account flow failed after we already knew the user's intent was
   * CONNECT (missing fields or a persistence error). Surface it on /auth-error
   * and return true so the caller does NOT fall through to login — logging the
   * user in here would silently switch sessions instead of reporting the error.
   */
  private redirectConnectError(
    providerName: string,
    frontendUrl: string,
    res: Response,
  ): true {
    this.redirectWithAuthError(
      new Error(
        `Failed to connect your ${providerName} account. Please try again.`,
      ),
      frontendUrl,
      res,
      providerName,
    );
    return true;
  }

  private redirectWithAuthError(
    error: Error,
    frontendUrl: string,
    res: Response,
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
    return parseSignedOAuthState(state);
  }

  /**
   * Enqueue an immediate inbox sync for a freshly connected (or reconnected)
   * mailbox. The OAuth "connect" flow returns early without going through
   * login()/scheduleSyncJobs(), so without this the inbox stays empty until
   * the next 5-minute fetch cron runs — which makes onboarding look broken
   * (e.g. Outlook showing zero emails).
   *
   * Note: no `singletonMinutes` here on purpose. login() and the fetch cron
   * enqueue the same `singletonKey` with a 5-minute throttle, and the login
   * sync usually fires (and finds nothing) seconds before the mailbox is
   * connected. A throttled send would be debounced away inside that window;
   * `singletonKey` alone still dedupes against an in-flight job without
   * suppressing this one.
   */
  private queueEmailFetchForConnectedAccount(userId: string): void {
    this.boss
      .send(
        JOB_NAMES.FETCH_USER_EMAILS,
        { userId },
        {
          priority: getJobPriority(JOB_NAMES.FETCH_USER_EMAILS, false),
          singletonKey: `fetch-user-emails-${userId}`,
        },
      )
      .catch((err) => {
        this.logger.warn(
          `Failed to queue email fetch for newly connected account user ${userId}: ${err}`,
        );
      });
  }

  private async handleGoogleConnectionState(
    state: string,
    req,
    res: Response,
    frontendUrl: string,
  ): Promise<boolean> {
    const stateData = this.parseOAuthState(state);
    if (
      !stateData ||
      stateData.action !== AUTH_ACTION_TYPES.CONNECT ||
      !stateData.userId
    )
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
      if (!googleId || !email || !accessToken || !refreshToken) {
        return this.redirectConnectError("Google", frontendUrl, res);
      }
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
        // Immediately trigger contact sync for newly linked Google account
        this.boss
          .send(
            JOB_NAMES.SYNC_CONTACTS,
            { userId: stateData.userId },
            {
              singletonKey: `sync-contacts-${stateData.userId}`,
              singletonSeconds: SECONDS.THIRTY_MINUTES,
            },
          )
          .catch((err) => {
            this.logger.warn(
              `Failed to queue contact sync for newly linked Google account user ${stateData.userId}: ${err}`,
            );
          });
      }
      this.queueEmailFetchForConnectedAccount(stateData.userId);
      res.redirect(`${frontendUrl}/settings?googleConnected=true`);
      return true;
    } catch (err) {
      logError(
        "Error parsing state in Google callback",
        err instanceof Error ? err : new Error(String(err)),
      );
      return this.redirectConnectError("Google", frontendUrl, res);
    }
  }

  private async handleMicrosoftConnectionState(
    state: string,
    req,
    res: Response,
    frontendUrl: string,
  ): Promise<boolean> {
    const stateData = this.parseOAuthState(state);
    if (
      !stateData ||
      stateData.action !== AUTH_ACTION_TYPES.CONNECT ||
      !stateData.userId
    )
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
      if (!microsoftId || !email || !accessToken || !refreshToken) {
        return this.redirectConnectError("Microsoft", frontendUrl, res);
      }
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
        await this.office365AccountsService.create({
          userId: stateData.userId,
          microsoftId,
          email,
          name,
          accessToken,
          refreshToken,
          isPrimary,
        });
      }
      this.queueEmailFetchForConnectedAccount(stateData.userId);
      res.redirect(`${frontendUrl}/settings?office365Connected=true`);
      return true;
    } catch (err) {
      logError(
        "Error parsing state in Microsoft callback",
        err instanceof Error ? err : new Error(String(err)),
      );
      return this.redirectConnectError("Microsoft", frontendUrl, res);
    }
  }

  private async saveMicrosoftAccountForUser(user: {
    id: string;
    microsoftId?: string;
    microsoftAccessToken?: string;
    microsoftRefreshToken?: string;
    microsoftProfile?: {
      id?: string;
      mail?: string;
      userPrincipalName?: string;
      displayName?: string;
    };
  }): Promise<void> {
    const microsoftId = user.microsoftId || user.microsoftProfile?.id || "";
    const accessToken = user.microsoftAccessToken || "";
    const refreshToken = user.microsoftRefreshToken || "";
    const email =
      user.microsoftProfile?.mail ||
      user.microsoftProfile?.userPrincipalName ||
      "";
    const name = user.microsoftProfile?.displayName || "";
    if (!microsoftId || !accessToken || !email) return;
    try {
      const existingAccounts =
        await this.office365AccountsService.findAllByUser(user.id);
      const accountExists = existingAccounts.find(
        (acc) => acc.microsoftId === microsoftId,
      );
      if (accountExists) {
        await this.office365AccountsService.updateTokens(
          accountExists.id,
          user.id,
          accessToken,
          refreshToken || undefined,
        );
      } else {
        if (!refreshToken) return;
        const isPrimary = existingAccounts.length === 0;
        await this.office365AccountsService.create({
          userId: user.id,
          microsoftId,
          email,
          name,
          accessToken,
          refreshToken,
          isPrimary,
        });
      }
    } catch (err) {
      this.logger.error(
        `Failed to save Office365Account for user ${user.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async handleZohoConnectionState(
    state: string,
    req,
    res: Response,
    frontendUrl: string,
  ): Promise<boolean> {
    const stateData = this.parseOAuthState(state);
    if (
      !stateData ||
      stateData.action !== AUTH_ACTION_TYPES.CONNECT ||
      !stateData.userId
    )
      return false;
    try {
      const zohoUser = req.user as {
        zohoProfile?: { ZUID?: string; Email?: string; Display_Name?: string };
        zohoAccessToken?: string;
        zohoRefreshToken?: string;
        zohoId?: string;
        accountsServer?: string;
      };
      const profile = zohoUser.zohoProfile;
      const accessToken = zohoUser.zohoAccessToken;
      const refreshToken = zohoUser.zohoRefreshToken;
      const zohoId = zohoUser.zohoId || profile?.ZUID || "";
      const email = profile?.Email || "";
      const name = profile?.Display_Name || "";
      const { accountsServer } = zohoUser;
      if (
        !zohoId ||
        !email ||
        !accessToken ||
        !refreshToken ||
        !accountsServer
      ) {
        return this.redirectConnectError("Zoho", frontendUrl, res);
      }
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
          accountsServer,
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
          accountsServer,
          isPrimary,
        });
      }
      this.queueEmailFetchForConnectedAccount(stateData.userId);
      res.redirect(`${frontendUrl}/settings?zohoConnected=true`);
      return true;
    } catch (err) {
      logError(
        "Error parsing state in Zoho callback",
        err instanceof Error ? err : new Error(String(err)),
      );
      return this.redirectConnectError("Zoho", frontendUrl, res);
    }
  }
}
