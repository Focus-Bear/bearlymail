import { PassportStrategy } from "@nestjs/passport";
import { Strategy, VerifyCallback } from "passport-oauth2";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { writeDebugLog } from "./auth-logger";
import { User } from "../database/entities/user.entity";

interface ZohoProfile {
  ZUID: string;
  Email: string;
  Display_Name?: string;
  First_Name?: string;
  Last_Name?: string;
}

interface UserWithZohoData extends Omit<User, "password"> {
  zohoProfile?: ZohoProfile;
  zohoAccessToken?: string;
  zohoRefreshToken?: string;
  zohoId?: string;
}

@Injectable()
export class ZohoStrategy extends PassportStrategy(Strategy, "zoho") {
  private readonly logger = new Logger(ZohoStrategy.name);

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const clientID = configService.get<string>("ZOHO_CLIENT_ID");
    const clientSecret = configService.get<string>("ZOHO_CLIENT_SECRET");
    const callbackURL = configService.get<string>("ZOHO_REDIRECT_URI");

    const apiDomain =
      configService.get<string>("ZOHO_API_DOMAIN") ||
      "https://accounts.zoho.com";

    super({
      authorizationURL: `${apiDomain}/oauth/v2/auth`,
      tokenURL: `${apiDomain}/oauth/v2/token`,
      clientID: clientID || "placeholder-client-id",
      clientSecret: clientSecret || "placeholder-client-secret",
      callbackURL: callbackURL || "http://localhost:3001/auth/zoho/callback",
      scope: [
        "ZohoMail.messages.READ",
        "ZohoMail.messages.CREATE",
        "ZohoMail.messages.UPDATE",
        "ZohoMail.accounts.READ",
      ],
    });

    // If environment variables are not set, log a warning
    // The strategy will still be registered but won't work until env vars are set
    if (!clientID || !clientSecret || !callbackURL) {
      this.logger.warn(
        "Zoho OAuth credentials not configured. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REDIRECT_URI environment variables.",
      );
    }
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _profile: unknown,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      this.logger.log(`[ZohoStrategy] OAuth callback received:`);
      this.logger.log(`  - accessToken: ${accessToken ? "[PRESENT]" : "NULL"}`);
      this.logger.log(
        `  - refreshToken: ${refreshToken ? "[PRESENT]" : "NULL"}`,
      );
      writeDebugLog(
        `[ZohoStrategy] OAuth callback - accessToken: ${accessToken ? "PRESENT" : "NULL"}, refreshToken: ${refreshToken ? "PRESENT" : "NULL"}`,
      );

      // Fetch user profile from Zoho API
      const zohoProfile = await this.fetchZohoProfile(accessToken);
      this.logger.log(`  - profile.ZUID: ${zohoProfile.ZUID}`);
      this.logger.log(`  - profile.Email: ${zohoProfile.Email || "N/A"}`);

      const user = await this.authService.validateZohoUser(
        zohoProfile,
        accessToken,
        refreshToken,
      );

      // Attach raw Zoho data for connection flows
      const userWithZohoData = user as UserWithZohoData;
      userWithZohoData.zohoProfile = zohoProfile;
      userWithZohoData.zohoAccessToken = accessToken;
      userWithZohoData.zohoRefreshToken = refreshToken;
      userWithZohoData.zohoId = zohoProfile.ZUID;

      done(null, userWithZohoData);
    } catch (error) {
      // Log the error for debugging
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const email = zohoProfile?.Email || "unknown";
      this.logger.error(
        `[ZohoStrategy] Authentication failed for ${email}: ${errorMessage}`,
      );

      // Pass error through both err parameter AND info parameter
      // Some versions of Passport.js pass the error through info instead of err
      done(error as Error, false, { message: errorMessage });
    }
  }

  private async fetchZohoProfile(accessToken: string): Promise<ZohoProfile> {
    const axios = require("axios");
    const apiDomain =
      this.configService.get<string>("ZOHO_API_DOMAIN") ||
      "https://accounts.zoho.com";
    const response = await axios.get(`${apiDomain}/oauth/v2/user/info`, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
    });
    return response.data;
  }
}
