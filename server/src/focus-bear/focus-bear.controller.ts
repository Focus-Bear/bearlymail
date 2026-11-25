import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request as ExpressRequest, Response } from "express";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Public } from "../auth/public.decorator";
import {
  DEFAULT_FRONTEND_URL,
  FOCUS_BEAR_CONNECT_RESULT_PARAM,
  FOCUS_BEAR_SETTINGS_ANCHOR,
  FOCUS_BEAR_SETTINGS_PATH,
  FOCUS_BEAR_THROTTLES,
  FocusBearConnectResult,
} from "../constants/focus-bear.constants";
import { FocusBearTaskSuggestionsDto } from "./dto/focus-bear.dto";
import { FocusBearService } from "./focus-bear.service";
import {
  FocusBearConnectionStatus,
  FocusBearTaskSuggestions,
} from "./focus-bear.types";
import {
  FocusBearCallbackQuery,
  FocusBearOAuthService,
} from "./focus-bear-oauth.service";

type AuthenticatedRequest = { user: { userId: string } };

/** Settings, scrolled to the Focus Bear card, with how the connection went. */
const settingsUrlFor = (result: FocusBearConnectResult): string => {
  const frontendUrl = (
    process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL
  ).replace(/\/+$/, "");
  const query = new URLSearchParams({
    [FOCUS_BEAR_CONNECT_RESULT_PARAM]: result,
  });
  return `${frontendUrl}${FOCUS_BEAR_SETTINGS_PATH}?${query}#${FOCUS_BEAR_SETTINGS_ANCHOR}`;
};

@Controller("focus-bear")
@UseGuards(JwtAuthGuard)
export class FocusBearController {
  constructor(
    private readonly focusBearService: FocusBearService,
    private readonly focusBearOAuth: FocusBearOAuthService,
  ) {}

  @Get("connection")
  getConnection(
    @Request() req: AuthenticatedRequest,
  ): Promise<FocusBearConnectionStatus> {
    return this.focusBearService.status(req.user.userId);
  }

  @Delete("connection")
  async disconnect(
    @Request() req: AuthenticatedRequest,
  ): Promise<FocusBearConnectionStatus> {
    await this.focusBearService.disconnect(req.user.userId);
    return this.focusBearService.status(req.user.userId);
  }

  /** Where to send the browser to sign in to Focus Bear; also sets the PKCE verifier cookie. */
  @Get("oauth/connect-url")
  @Throttle(FOCUS_BEAR_THROTTLES.CONNECTION)
  getConnectUrl(
    @Request() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): { url: string } {
    return { url: this.focusBearOAuth.beginConnect(req.user.userId, res) };
  }

  /** Focus Bear's sign-in redirects here; the signed state and the verifier cookie identify the user. */
  @Public()
  @Get("oauth/callback")
  async oauthCallback(
    @Query() query: FocusBearCallbackQuery,
    @Request() req: ExpressRequest,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.focusBearOAuth.completeConnect(query, req, res);
    res.redirect(settingsUrlFor(result));
  }

  /** The project and due date "Save to Focus Bear" pre-fills for an action item. */
  @Post("task-suggestions")
  @HttpCode(HttpStatus.OK)
  @Throttle(FOCUS_BEAR_THROTTLES.SUGGESTIONS)
  async suggestForTask(
    @Request() req: AuthenticatedRequest,
    @Body() body: FocusBearTaskSuggestionsDto,
  ): Promise<FocusBearTaskSuggestions> {
    return this.focusBearService.suggestForTask(req.user.userId, body);
  }
}
