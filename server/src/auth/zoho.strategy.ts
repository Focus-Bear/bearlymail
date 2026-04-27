import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import axios from "axios";
import { Strategy } from "passport-oauth2";
import { User } from "../database/entities/user.entity";
import { AuthService } from "./auth.service";
import { writeDebugLog } from "./auth-logger";

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
        "aaaserver.profile.READ",
        "ZohoMail.messages.READ",
        "ZohoMail.messages.CREATE",
        "ZohoMail.messages.UPDATE",
        "ZohoMail.accounts.READ",
        "ZohoMail.folders.READ",
        "ZohoMail.folders.ALL",
      ],
    });

    if (!clientID || !clientSecret || !callbackURL) {
      this.logger.warn(
        "Zoho OAuth credentials not configured. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REDIRECT_URI environment variables.",
      );
    }
  }

  authorizationParams(): Record<string, string> {
    return {
      access_type: "offline",
      prompt: "consent",
    };
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    _profile: unknown,
  ): Promise<UserWithZohoData> {
    this.logger.debug(`[ZohoStrategy] OAuth callback received:`);
    this.logger.debug(`  - accessToken: ${accessToken ? "[PRESENT]" : "NULL"}`);
    this.logger.debug(`  - refreshToken: ${refreshToken ? "[PRESENT]" : "NULL"}`);
    this.logger.debug(`  - raw _profile: ${JSON.stringify(_profile)}`);

    writeDebugLog(
      `[ZohoStrategy] OAuth callback - accessToken: ${accessToken ? "PRESENT" : "NULL"}, refreshToken: ${refreshToken ? "PRESENT" : "NULL"}`,
    );

    try {
      const zohoProfile = await this.fetchZohoProfile(accessToken);

      this.logger.debug(`  - profile.ZUID: ${zohoProfile.ZUID}`);
      this.logger.debug(`  - profile.Email: ${zohoProfile.Email || "N/A"}`);

      const user = await this.authService.validateZohoUser(
        zohoProfile,
        accessToken,
        refreshToken,
      );

      const userWithZohoData = user as UserWithZohoData;
      userWithZohoData.zohoProfile = zohoProfile;
      userWithZohoData.zohoAccessToken = accessToken;
      userWithZohoData.zohoRefreshToken = refreshToken;
      userWithZohoData.zohoId = zohoProfile.ZUID;

      return userWithZohoData;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `[ZohoStrategy] Authentication failed: ${errorMessage}`,
      );
      throw error;
    }
  }

  private async fetchZohoProfile(accessToken: string): Promise<ZohoProfile> {
    const headers = {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    };
    const apiDomain =
      this.configService.get<string>("ZOHO_API_DOMAIN") ||
      "https://accounts.zoho.com";

    const accountEndpoints = [
      `${apiDomain}/oauth/user/info`,
      `${apiDomain}/oauth/v2/user/info`,
      "https://accounts.zoho.com/oauth/user/info",
      "https://accounts.zoho.com/oauth/v2/user/info",
    ];

    for (const url of accountEndpoints) {
      try {
        const response = await axios.get(url, { headers });
        this.logger.debug(`[ZohoStrategy] Profile fetch succeeded at ${url}`);
        this.logger.debug(`[ZohoStrategy] Profile data: ${JSON.stringify(response.data)}`);
        return response.data as ZohoProfile;
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : "unknown";
        this.logger.warn(
          `[ZohoStrategy] Profile fetch failed at ${url} — status: ${status}, body: ${JSON.stringify(axios.isAxiosError(error) ? error.response?.data : null)}`
        );
      }
    }

    // Fallback: Zoho Mail API
    const mailEndpoints = [
      "https://mail.zoho.com.au/api/accounts",
      "https://mail.zoho.com/api/accounts",
    ];

    for (const url of mailEndpoints) {
      try {
        const response = await axios.get(url, { headers });
        this.logger.debug(`[ZohoStrategy] Mail API response: ${JSON.stringify(response.data)}`);

        let accounts: unknown[] | null = null;
        if (Array.isArray(response.data?.data)) {
          accounts = response.data.data;
        } else if (Array.isArray(response.data)) {
          accounts = response.data;
        }

        if (accounts && accounts.length > 0) {
          const account = accounts[0] as {
            accountId?: string;
            primaryEmailAddress?: string;
            displayName?: string;
            emailAddress?: { mailId?: string }[];
          };

          // Some Zoho AU accounts return emailAddress array instead of primaryEmailAddress
          const email =
            account.primaryEmailAddress ||
            account.emailAddress?.[0]?.mailId;

          if (account.accountId && email) {
            this.logger.debug(
              `[ZohoStrategy] Mail API fallback succeeded at ${url}`,
            );
            return {
              ZUID: account.accountId,
              Email: email,
              Display_Name: account.displayName,
            };
          }
        }
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : "unknown";
        this.logger.warn(
          `[ZohoStrategy] Mail fallback failed at ${url} — status: ${status}`,
        );
      }
    }

    throw new Error(
      "Failed to fetch Zoho profile from all endpoints. Check logs for status codes.",
    );
  }
}