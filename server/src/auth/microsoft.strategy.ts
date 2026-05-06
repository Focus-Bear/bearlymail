import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import axios from "axios";
import { Strategy } from "passport-oauth2";

import { User } from "../database/entities/user.entity";
import { AuthService } from "./auth.service";
import { writeDebugLog } from "./auth-logger";

interface MicrosoftProfile {
  id: string;
  mail?: string;
  userPrincipalName?: string;
  displayName?: string;
}

interface UserWithMicrosoftData extends Omit<User, "password"> {
  microsoftProfile?: MicrosoftProfile;
  microsoftAccessToken?: string;
  microsoftRefreshToken?: string;
  microsoftId?: string;
}

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, "microsoft") {
  private readonly logger = new Logger(MicrosoftStrategy.name);

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const clientID = configService.get<string>("MICROSOFT_CLIENT_ID");
    const clientSecret = configService.get<string>("MICROSOFT_CLIENT_SECRET");
    const callbackURL = configService.get<string>("MICROSOFT_REDIRECT_URI");

    const tenantId =
      configService.get<string>("MICROSOFT_TENANT_ID") || "common";
    const authorizationURL = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
    const tokenURL = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    super({
      authorizationURL,
      tokenURL,
      clientID: clientID || "placeholder-client-id",
      clientSecret: clientSecret || "placeholder-client-secret",
      callbackURL:
        callbackURL || "http://localhost:3001/auth/microsoft/callback",
      scope: [
        "openid",
        "profile",
        "email",
        "offline_access",
        "https://graph.microsoft.com/User.Read",
        "https://graph.microsoft.com/Mail.Read",
        "https://graph.microsoft.com/Mail.Send",
        "https://graph.microsoft.com/Mail.ReadWrite",
      ],
    });

    // If environment variables are not set, log a warning
    // The strategy will still be registered but won't work until env vars are set
    if (!clientID || !clientSecret || !callbackURL) {
      this.logger.warn(
        "Microsoft OAuth credentials not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_REDIRECT_URI environment variables.",
      );
    }
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    _profile: unknown,
  ): Promise<UserWithMicrosoftData> {
    // NestJS Passport pattern: return user on success, throw error on failure
    // Do NOT call done() directly - NestJS Passport wrapper handles that
    this.logger.log(`[MicrosoftStrategy] OAuth callback received:`);
    this.logger.log(`  - accessToken: ${accessToken ? "[PRESENT]" : "NULL"}`);
    this.logger.log(`  - refreshToken: ${refreshToken ? "[PRESENT]" : "NULL"}`);
    writeDebugLog(
      `[MicrosoftStrategy] OAuth callback - accessToken: ${accessToken ? "PRESENT" : "NULL"}, refreshToken: ${refreshToken ? "PRESENT" : "NULL"}`,
    );

    try {
      // Fetch user profile from Microsoft Graph API
      const graphProfile = await this.fetchMicrosoftProfile(accessToken);
      this.logger.log(`  - profile.id: ${graphProfile.id}`);
      this.logger.log(
        `  - profile.mail: ${graphProfile.mail || graphProfile.userPrincipalName || "N/A"}`,
      );

      const user = await this.authService.validateMicrosoftUser(
        graphProfile,
        accessToken,
        refreshToken,
      );

      // Attach raw Microsoft data for connection flows
      const userWithMicrosoftData = user as UserWithMicrosoftData;
      userWithMicrosoftData.microsoftProfile = graphProfile;
      userWithMicrosoftData.microsoftAccessToken = accessToken;
      userWithMicrosoftData.microsoftRefreshToken = refreshToken;
      userWithMicrosoftData.microsoftId = graphProfile.id;

      return userWithMicrosoftData;
    } catch (error) {
      // Log the error for debugging (profile may be unavailable if fetch failed)
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `[MicrosoftStrategy] Authentication failed: ${errorMessage}`,
      );

      // Throw the error - NestJS Passport will pass it to handleRequest
      throw error;
    }
  }

  private async fetchMicrosoftProfile(
    accessToken: string,
  ): Promise<MicrosoftProfile> {
    const response = await axios.get("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data;
  }
}
