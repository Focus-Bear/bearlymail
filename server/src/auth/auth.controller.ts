import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Res,
  BadRequestException,
  Query,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LocalAuthGuard } from "./local-auth.guard";
import { GoogleAuthGuard } from "./google-auth.guard";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private googleAccountsService: GoogleAccountsService,
  ) {}

  @Post("register")
  async register(
    @Body() body: { email: string; password: string; name?: string },
  ) {
    // Registration is disabled - users must join waitlist first
    throw new BadRequestException(
      "Registration is currently closed. Please join our waitlist first.",
    );
  }

  @Post("setup-password")
  async setupPassword(@Body() body: { token: string; password: string }) {
    return this.authService.setupPassword(body.token, body.password);
  }

  @UseGuards(LocalAuthGuard)
  @Post("login")
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Get("google")
  @UseGuards(GoogleAuthGuard)
  async googleAuth(@Request() req) {}

  @Get("google/callback")
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(
    @Request() req,
    @Res() res,
    @Query("state") state?: string,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    // Check if this is a connection flow (has state with userId)
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, "base64").toString());
        if (stateData.action === "connect" && stateData.userId) {
          // This is a connection flow, not a login
          const googleUser = req.user;
          const profile = (googleUser as any).googleProfile;
          const accessToken =
            (googleUser as any).googleAccessToken ||
            googleUser.googleCalendarAccessToken;
          const refreshToken =
            (googleUser as any).googleRefreshToken ||
            googleUser.googleCalendarRefreshToken;
          const googleId =
            (googleUser as any).googleId || profile?.id || googleUser.googleId;
          const email = profile?.emails?.[0]?.value || googleUser.email;
          const name = profile?.displayName || googleUser.name || "";

          if (googleId && email && accessToken && refreshToken) {
            const existingAccounts =
              await this.googleAccountsService.findAllByUser(stateData.userId);
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
              await this.googleAccountsService.create(
                stateData.userId,
                googleId,
                email,
                name,
                accessToken,
                refreshToken,
                isPrimary,
              );
            }

            return res.redirect(`${frontendUrl}/settings?googleConnected=true`);
          }
        }
      } catch (e) {
        // Invalid state, fall through to login flow
        console.error("Error parsing state in Google callback:", e);
      }
    }

    // Regular login flow
    const loginData = await this.authService.login(req.user);
    res.redirect(`${frontendUrl}/login?token=${loginData.access_token}`);
  }
}
