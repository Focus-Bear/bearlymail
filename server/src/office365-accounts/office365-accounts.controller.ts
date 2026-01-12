import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Request,
  Res,
} from "@nestjs/common";
import { Office365AccountsService } from "./office365-accounts.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthService } from "../auth/auth.service";

@Controller("office365-accounts")
export class Office365AccountsController {
  constructor(
    private office365AccountsService: Office365AccountsService,
    private authService: AuthService,
  ) {}

  @Get("connect")
  @UseGuards(JwtAuthGuard)
  async connectOffice365Account(@Request() req, @Res() res) {
    // Create state parameter with user ID and action
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req.user as any).userId || (req.user as any).id;
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
  async getConnectUrl(@Request() req) {
    // Create state parameter with user ID and action
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req.user as any).userId || (req.user as any).id;
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
  async getAccounts(@Request() req) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req.user as any).userId || (req.user as any).id;
    return this.office365AccountsService.findAllByUser(userId);
  }

  @Post(":id/set-primary")
  @UseGuards(JwtAuthGuard)
  async setPrimary(@Param("id") id: string, @Request() req) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req.user as any).userId || (req.user as any).id;
    return this.office365AccountsService.setPrimary(id, userId);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  async disconnectAccount(@Param("id") id: string, @Request() req) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req.user as any).userId || (req.user as any).id;
    await this.office365AccountsService.deactivate(id, userId);
    return { success: true };
  }
}
