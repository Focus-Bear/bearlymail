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
import { AuthenticatedRequest } from "../types/common";
import { Office365AccountsService } from "./office365-accounts.service";

@Controller("office365-accounts")
export class Office365AccountsController {
  constructor(
    private office365AccountsService: Office365AccountsService,
    private authService: AuthService,
  ) {}

  @Get("connect")
  @UseGuards(JwtAuthGuard)
  async connectOffice365Account(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    // Create state parameter with user ID and action
    const { userId } = req.user;
    const state = Buffer.from(
      JSON.stringify({
        userId,
        action: "connect",
      }),
    ).toString("base64");

    // Redirect to Microsoft OAuth endpoint with state parameter
    const microsoftAuthUrl = `${process.env.MICROSOFT_REDIRECT_URI?.replace("/auth/microsoft/callback", "") || "http://localhost:3001"}/auth/microsoft`;
    res.redirect(`${microsoftAuthUrl}?state=${encodeURIComponent(state)}`);
  }

  @Get("connect-url")
  @UseGuards(JwtAuthGuard)
  async getConnectUrl(@Req() req: AuthenticatedRequest) {
    // Create state parameter with user ID and action
    const { userId } = req.user;
    const state = Buffer.from(
      JSON.stringify({
        userId,
        action: "connect",
      }),
    ).toString("base64");

    // Return Microsoft OAuth URL instead of redirecting
    const microsoftAuthUrl = `${process.env.MICROSOFT_REDIRECT_URI?.replace("/auth/microsoft/callback", "") || "http://localhost:3001"}/auth/microsoft`;
    return { url: `${microsoftAuthUrl}?state=${encodeURIComponent(state)}` };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAccounts(@Req() req: AuthenticatedRequest) {
    const { userId } = req.user;
    return this.office365AccountsService.findAllByUser(userId);
  }

  @Post(":id/set-primary")
  @UseGuards(JwtAuthGuard)
  async setPrimary(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    const { userId } = req.user;
    return this.office365AccountsService.setPrimary(id, userId);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  async disconnectAccount(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const { userId } = req.user;
    await this.office365AccountsService.deactivate(id, userId);
    return { success: true };
  }
}
