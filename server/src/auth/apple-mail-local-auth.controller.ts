import {
  Controller,
  forwardRef,
  Get,
  Inject,
  Logger,
  Post,
  Request,
  Res,
} from "@nestjs/common";
import { Response } from "express";

import { AppleMailAccountsService } from "../apple-mail-accounts/apple-mail-accounts.service";
import { AUTH_CONSTANTS } from "../constants/auth-constants";
import { NODE_ENV_VALUES } from "../constants/domain-types";
import {
  assertLocalAppleMailMode,
  isLocalAppleMailMode,
} from "./apple-mail-local-mode.util";
import { AuthService } from "./auth.service";
import { jwtCookieOptions } from "./jwt-cookie.util";

/**
 * Passwordless "Continue with Apple Mail" login, used only when BearlyMail
 * runs locally on the user's own Mac. Split out of AuthController so the local
 * mode's gating and orchestration live together.
 */
@Controller("auth")
export class AppleMailLocalAuthController {
  private readonly logger = new Logger(AppleMailLocalAuthController.name);

  constructor(
    private authService: AuthService,
    @Inject(forwardRef(() => AppleMailAccountsService))
    private appleMailAccountsService: AppleMailAccountsService,
  ) {}

  /**
   * Strictly gated: only reachable outside production, on macOS (so Apple Mail
   * exists), and when called on localhost. Logs the local user in, connects
   * their Mail.app accounts, and kicks off a sync.
   */
  @Post("apple-mail-local")
  async appleMailLocalLogin(
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertLocalAppleMailMode(
      req.hostname,
      this.appleMailAccountsService.isAvailable(),
    );

    const loginData = await this.authService.loginLocalAppleMailUser();
    try {
      await this.appleMailAccountsService.connect(loginData.user.id);
    } catch (error) {
      this.logger.warn(
        `Apple Mail connect during local login failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const isProduction = process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION;
    res.cookie(
      AUTH_CONSTANTS.COOKIE_NAME,
      loginData.access_token,
      jwtCookieOptions(isProduction),
    );
    return loginData;
  }

  /**
   * Whether the passwordless Apple Mail login is offered — surfaced to the
   * login page so it only shows the button when it will actually work.
   */
  @Get("apple-mail-local/available")
  appleMailLocalAvailable(@Request() req): { available: boolean } {
    return {
      available: isLocalAppleMailMode(
        req.hostname,
        this.appleMailAccountsService.isAvailable(),
      ),
    };
  }
}
