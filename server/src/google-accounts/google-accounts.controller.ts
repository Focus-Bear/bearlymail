import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";

import { AuthService } from "../auth/auth.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { createConnectState } from "../auth/oauth-state.util";
import { StepUpAuthGuard } from "../auth/step-up.guard";
import { AuthenticatedRequest } from "../types/common";
import { GoogleAccountsService } from "./google-accounts.service";

@Controller("google-accounts")
export class GoogleAccountsController {
  constructor(
    private googleAccountsService: GoogleAccountsService,
    private authService: AuthService,
  ) {}

  @Get("connect")
  @UseGuards(JwtAuthGuard)
  async connectGoogleAccount(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    // Create state parameter with user ID and action
    // JWT strategy returns { userId, email }, not { id }
    const { userId } = req.user;
    const state = createConnectState(userId);

    // Redirect to Google OAuth endpoint with state parameter
    // Pass state as query param - Google OAuth will preserve it in the callback
    const googleAuthUrl = `${process.env.GOOGLE_REDIRECT_URI?.replace("/auth/google/callback", "") || "http://localhost:3001"}/auth/google`;
    res.redirect(`${googleAuthUrl}?state=${encodeURIComponent(state)}`);
  }

  @Get("connect-url")
  @UseGuards(JwtAuthGuard)
  async getConnectUrl(@Req() req: AuthenticatedRequest) {
    // Create state parameter with user ID and action
    const { userId } = req.user;
    const state = createConnectState(userId);

    // Return Google OAuth URL instead of redirecting
    const googleAuthUrl = `${process.env.GOOGLE_REDIRECT_URI?.replace("/auth/google/callback", "") || "http://localhost:3001"}/auth/google`;
    return { url: `${googleAuthUrl}?state=${encodeURIComponent(state)}` };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAccounts(@Req() req: AuthenticatedRequest) {
    const { userId } = req.user;
    return this.googleAccountsService.findAllByUser(userId);
  }

  @Post(":id/set-primary")
  @UseGuards(JwtAuthGuard)
  async setPrimary(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    const { userId } = req.user;
    return this.googleAccountsService.setPrimary(id, userId);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, StepUpAuthGuard)
  async disconnectAccount(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const { userId } = req.user;
    await this.googleAccountsService.deactivate(id, userId);
    return { success: true };
  }
}
