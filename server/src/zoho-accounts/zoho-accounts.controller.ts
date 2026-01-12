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
import { ZohoAccountsService } from "./zoho-accounts.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthService } from "../auth/auth.service";

@Controller("zoho-accounts")
export class ZohoAccountsController {
  constructor(
    private zohoAccountsService: ZohoAccountsService,
    private authService: AuthService,
  ) {}

  @Get("connect")
  @UseGuards(JwtAuthGuard)
  async connectZohoAccount(@Request() req, @Res() res) {
    // Create state parameter with user ID and action
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req.user as any).userId || (req.user as any).id;
    const state = Buffer.from(
      JSON.stringify({
        userId,
        action: "connect",
      }),
    ).toString("base64");

    // Redirect to Zoho OAuth endpoint with state parameter
    const zohoAuthUrl = `${process.env.ZOHO_REDIRECT_URI?.replace("/auth/zoho/callback", "") || "http://localhost:3001"}/auth/zoho`;
    res.redirect(`${zohoAuthUrl}?state=${encodeURIComponent(state)}`);
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

    // Return Zoho OAuth URL instead of redirecting
    const zohoAuthUrl = `${process.env.ZOHO_REDIRECT_URI?.replace("/auth/zoho/callback", "") || "http://localhost:3001"}/auth/zoho`;
    return { url: `${zohoAuthUrl}?state=${encodeURIComponent(state)}` };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAccounts(@Request() req) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req.user as any).userId || (req.user as any).id;
    return this.zohoAccountsService.findAllByUser(userId);
  }

  @Post(":id/set-primary")
  @UseGuards(JwtAuthGuard)
  async setPrimary(@Param("id") id: string, @Request() req) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req.user as any).userId || (req.user as any).id;
    return this.zohoAccountsService.setPrimary(id, userId);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  async disconnectAccount(@Param("id") id: string, @Request() req) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req.user as any).userId || (req.user as any).id;
    await this.zohoAccountsService.deactivate(id, userId);
    return { success: true };
  }
}
