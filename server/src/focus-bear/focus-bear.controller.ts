import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Request,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type {
  CookieOptions,
  Request as ExpressRequest,
  Response,
} from "express";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  createConnectState,
  parseBrowserBoundOAuthState,
  readCookie,
} from "../auth/oauth-state.util";
import { AUTH_ACTION_TYPES, NODE_ENV_VALUES } from "../constants/domain-types";
import {
  FOCUS_BEAR_CONNECT_RESULT,
  FOCUS_BEAR_OAUTH,
  FOCUS_BEAR_THROTTLES,
} from "../constants/focus-bear.constants";
import { MILLISECONDS } from "../constants/time-constants";
import { FocusBearTaskSuggestionsDto } from "./dto/focus-bear.dto";
import { FocusBearService } from "./focus-bear.service";
import { FocusBearTaskSuggestions } from "./focus-bear.types";
import { FocusBearOAuthClient } from "./focus-bear-oauth.client";

type AuthenticatedRequest = { user: { userId: string } };

const DEFAULT_FRONTEND_URL = "http://localhost:3000";

function codeVerifierCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION,
    // Lax, not Strict: the callback is a top-level redirect from Focus Bear.
    sameSite: "lax",
    maxAge: MILLISECONDS.HOUR,
    path: "/",
  };
}

@Controller("focus-bear")
export class FocusBearController {
  private readonly logger = new Logger(FocusBearController.name);

  constructor(
    private readonly focusBearService: FocusBearService,
    private readonly oauthClient: FocusBearOAuthClient,
  ) {}

  @Get("connection")
  @UseGuards(JwtAuthGuard)
  async getConnection(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ connected: boolean }> {
    return {
      connected: await this.focusBearService.isConnected(req.user.userId),
    };
  }

  /** Where to send the browser so the user can sign in to Focus Bear and consent. */
  @Get("connect-url")
  @UseGuards(JwtAuthGuard)
  @Throttle(FOCUS_BEAR_THROTTLES.CONNECT_START)
  getConnectUrl(
    @Request() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): { url: string } {
    if (!this.oauthClient.isConfigured()) {
      throw new ServiceUnavailableException(
        "Focus Bear sign-in is not set up on this server",
      );
    }
    const { verifier, challenge } = this.oauthClient.createPkcePair();
    res.cookie(
      FOCUS_BEAR_OAUTH.CODE_VERIFIER_COOKIE,
      verifier,
      codeVerifierCookieOptions(),
    );
    const state = createConnectState(req.user.userId, res);
    return { url: this.oauthClient.buildAuthorizeUrl(state, challenge) };
  }

  /**
   * Focus Bear redirects the browser here after sign-in. There is no session guard: the user is
   * identified by the signed state, which must have been started by this same browser.
   */
  @Get("oauth/callback")
  async handleOAuthCallback(
    @Req() req: ExpressRequest,
    @Res() res: Response,
    @Query("code") code?: string,
    @Query("state") rawState?: string,
  ): Promise<void> {
    const codeVerifier = readCookie(req, FOCUS_BEAR_OAUTH.CODE_VERIFIER_COOKIE);
    res.clearCookie(FOCUS_BEAR_OAUTH.CODE_VERIFIER_COOKIE, { path: "/" });
    const state = rawState ? parseBrowserBoundOAuthState(rawState, req) : null;
    const isOwnConnect = state?.action === AUTH_ACTION_TYPES.CONNECT;
    if (!state || !isOwnConnect || !code || !codeVerifier) {
      // Covers the user declining consent too: Focus Bear then sends `error`, and no code.
      return res.redirect(this.resultUrl(FOCUS_BEAR_CONNECT_RESULT.FAILED));
    }
    try {
      await this.focusBearService.completeConnection(
        state.userId,
        code,
        codeVerifier,
      );
    } catch (error) {
      this.logger.warn(
        `Focus Bear connection not completed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return res.redirect(this.resultUrl(FOCUS_BEAR_CONNECT_RESULT.FAILED));
    }
    return res.redirect(this.resultUrl(FOCUS_BEAR_CONNECT_RESULT.CONNECTED));
  }

  @Delete("connection")
  @UseGuards(JwtAuthGuard)
  async disconnect(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ connected: boolean }> {
    await this.focusBearService.disconnect(req.user.userId);
    return { connected: false };
  }

  /** The project and due date "Save to Focus Bear" pre-fills for an action item. */
  @Post("task-suggestions")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle(FOCUS_BEAR_THROTTLES.SUGGESTIONS)
  async suggestForTask(
    @Request() req: AuthenticatedRequest,
    @Body() body: FocusBearTaskSuggestionsDto,
  ): Promise<FocusBearTaskSuggestions> {
    return this.focusBearService.suggestForTask(req.user.userId, body);
  }

  private resultUrl(result: string): string {
    const frontendUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL;
    const url = new URL(FOCUS_BEAR_CONNECT_RESULT.SETTINGS_PATH, frontendUrl);
    url.searchParams.set(FOCUS_BEAR_CONNECT_RESULT.QUERY_PARAM, result);
    url.hash = FOCUS_BEAR_CONNECT_RESULT.ANCHOR;
    return url.toString();
  }
}
