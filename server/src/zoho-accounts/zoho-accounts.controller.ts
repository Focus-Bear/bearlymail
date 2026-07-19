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
import { ZohoAccountsService } from "./zoho-accounts.service";

@Controller("zoho-accounts")
export class ZohoAccountsController {
  constructor(
    private zohoAccountsService: ZohoAccountsService,
    private authService: AuthService,
  ) {}

  @Get("connect")
  @UseGuards(JwtAuthGuard)
  async connectZohoAccount(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    // Create state parameter with user ID and action
    const { userId } = req.user;
    const state = createConnectState(userId);

    // Redirect to Zoho OAuth endpoint with state parameter
    const zohoAuthUrl = `${process.env.ZOHO_REDIRECT_URI?.replace("/auth/zoho/callback", "") || "http://localhost:3001"}/auth/zoho`;
    res.redirect(`${zohoAuthUrl}?state=${encodeURIComponent(state)}`);
  }

  @Get("connect-url")
  @UseGuards(JwtAuthGuard)
  async getConnectUrl(@Req() req: AuthenticatedRequest) {
    // Create state parameter with user ID and action
    const { userId } = req.user;
    const state = createConnectState(userId);

    // Return Zoho OAuth URL instead of redirecting
    const zohoAuthUrl = `${process.env.ZOHO_REDIRECT_URI?.replace("/auth/zoho/callback", "") || "http://localhost:3001"}/auth/zoho`;
    return { url: `${zohoAuthUrl}?state=${encodeURIComponent(state)}` };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAccounts(@Req() req: AuthenticatedRequest) {
    const { userId } = req.user;
    return this.zohoAccountsService.findAllByUser(userId);
  }

  @Post(":id/set-primary")
  @UseGuards(JwtAuthGuard)
  async setPrimary(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    const { userId } = req.user;
    return this.zohoAccountsService.setPrimary(id, userId);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, StepUpAuthGuard)
  async disconnectAccount(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const { userId } = req.user;
    await this.zohoAccountsService.deactivate(id, userId);
    return { success: true };
  }
}
