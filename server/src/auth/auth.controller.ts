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
import { MicrosoftAuthGuard } from "./microsoft-auth.guard";
import { ZohoAuthGuard } from "./zoho-auth.guard";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { Office365AccountsService } from "../office365-accounts/office365-accounts.service";
import { ZohoAccountsService } from "../zoho-accounts/zoho-accounts.service";

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private googleAccountsService: GoogleAccountsService,
    private office365AccountsService: Office365AccountsService,
    private zohoAccountsService: ZohoAccountsService,
  ) {}

  @Post("register")
  async register(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Body() _body: { email: string; password: string; name?: string },
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async googleAuth(@Request() _req) {}

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
          const googleUser = req.user as {
            googleProfile?: {
              id?: string;
              emails?: Array<{ value: string }>;
              displayName?: string;
            };
            googleAccessToken?: string;
            googleRefreshToken?: string;
            googleId?: string;
            googleCalendarAccessToken?: string;
            googleCalendarRefreshToken?: string;
            email?: string;
            name?: string;
          };
          const profile = googleUser.googleProfile;
          const accessToken =
            googleUser.googleAccessToken ||
            googleUser.googleCalendarAccessToken;
          const refreshToken =
            googleUser.googleRefreshToken ||
            googleUser.googleCalendarRefreshToken;
          const googleId =
            googleUser.googleId || profile?.id || googleUser.googleId;
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

  @Get("microsoft")
  @UseGuards(MicrosoftAuthGuard)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async microsoftAuth(@Request() _req) {}

  @Get("microsoft/callback")
  @UseGuards(MicrosoftAuthGuard)
  async microsoftAuthRedirect(
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
          const microsoftUser = req.user as {
            microsoftProfile?: {
              id?: string;
              mail?: string;
              userPrincipalName?: string;
              displayName?: string;
            };
            microsoftAccessToken?: string;
            microsoftRefreshToken?: string;
            microsoftId?: string;
          };
          const profile = microsoftUser.microsoftProfile;
          const accessToken = microsoftUser.microsoftAccessToken;
          const refreshToken = microsoftUser.microsoftRefreshToken;
          const microsoftId = microsoftUser.microsoftId || profile?.id || "";
          const email = profile?.mail || profile?.userPrincipalName || "";
          const name = profile?.displayName || "";

          if (microsoftId && email && accessToken && refreshToken) {
            const existingAccounts =
              await this.office365AccountsService.findAllByUser(
                stateData.userId,
              );
            const accountExists = existingAccounts.find(
              (acc) => acc.microsoftId === microsoftId,
            );

            if (accountExists) {
              await this.office365AccountsService.updateTokens(
                accountExists.id,
                stateData.userId,
                accessToken,
                refreshToken,
              );
            } else {
              const isPrimary = existingAccounts.length === 0;
              await this.office365AccountsService.create(
                stateData.userId,
                microsoftId,
                email,
                name,
                accessToken,
                refreshToken,
                isPrimary,
              );
            }

            return res.redirect(
              `${frontendUrl}/settings?office365Connected=true`,
            );
          }
        }
      } catch (e) {
        // Invalid state, fall through to login flow
        console.error("Error parsing state in Microsoft callback:", e);
      }
    }

    // Regular login flow
    const loginData = await this.authService.login(req.user);
    res.redirect(`${frontendUrl}/login?token=${loginData.access_token}`);
  }

  @Get("zoho")
  @UseGuards(ZohoAuthGuard)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async zohoAuth(@Request() _req) {}

  @Get("zoho/callback")
  @UseGuards(ZohoAuthGuard)
  async zohoAuthRedirect(
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
          const zohoUser = req.user as {
            zohoProfile?: {
              ZUID?: string;
              Email?: string;
              Display_Name?: string;
            };
            zohoAccessToken?: string;
            zohoRefreshToken?: string;
            zohoId?: string;
          };
          const profile = zohoUser.zohoProfile;
          const accessToken = zohoUser.zohoAccessToken;
          const refreshToken = zohoUser.zohoRefreshToken;
          const zohoId = zohoUser.zohoId || profile?.ZUID || "";
          const email = profile?.Email || "";
          const name = profile?.Display_Name || "";

          if (zohoId && email && accessToken && refreshToken) {
            const existingAccounts =
              await this.zohoAccountsService.findAllByUser(stateData.userId);
            const accountExists = existingAccounts.find(
              (acc) => acc.zohoId === zohoId,
            );

            if (accountExists) {
              await this.zohoAccountsService.updateTokens(
                accountExists.id,
                stateData.userId,
                accessToken,
                refreshToken,
              );
            } else {
              const isPrimary = existingAccounts.length === 0;
              await this.zohoAccountsService.create(
                stateData.userId,
                zohoId,
                email,
                name,
                accessToken,
                refreshToken,
                isPrimary,
              );
            }

            return res.redirect(`${frontendUrl}/settings?zohoConnected=true`);
          }
        }
      } catch (e) {
        // Invalid state, fall through to login flow
        console.error("Error parsing state in Zoho callback:", e);
      }
    }

    // Regular login flow
    const loginData = await this.authService.login(req.user);
    res.redirect(`${frontendUrl}/login?token=${loginData.access_token}`);
  }
}
