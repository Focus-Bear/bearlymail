import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Request,
  Res,
  Query,
} from "@nestjs/common";
import { GoogleAccountsService } from "./google-accounts.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { GoogleAuthGuard } from "../auth/google-auth.guard";
import { AuthService } from "../auth/auth.service";

@Controller("google-accounts")
export class GoogleAccountsController {
  constructor(
    private googleAccountsService: GoogleAccountsService,
    private authService: AuthService,
  ) {}

  @Get("connect")
  @UseGuards(JwtAuthGuard)
  async connectGoogleAccount(@Request() req, @Res() res) {
    // Create state parameter with user ID and action
    // JWT strategy returns { userId, email }, not { id }
    const userId = (req.user as any).userId || (req.user as any).id;
    const state = Buffer.from(
      JSON.stringify({
        userId,
        action: "connect",
      }),
    ).toString("base64");

    // Redirect to Google OAuth endpoint with state parameter
    // Pass state as query param - Google OAuth will preserve it in the callback
    const googleAuthUrl = `${process.env.GOOGLE_REDIRECT_URI?.replace("/auth/google/callback", "") || "http://localhost:3001"}/auth/google`;
    res.redirect(`${googleAuthUrl}?state=${encodeURIComponent(state)}`);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAccounts(@Request() req) {
    const userId = (req.user as any).userId || (req.user as any).id;
    return this.googleAccountsService.findAllByUser(userId);
  }

  @Post(":id/set-primary")
  @UseGuards(JwtAuthGuard)
  async setPrimary(@Param("id") id: string, @Request() req) {
    const userId = (req.user as any).userId || (req.user as any).id;
    return this.googleAccountsService.setPrimary(id, userId);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  async disconnectAccount(@Param("id") id: string, @Request() req) {
    const userId = (req.user as any).userId || (req.user as any).id;
    await this.googleAccountsService.deactivate(id, userId);
    return { success: true };
  }
}
