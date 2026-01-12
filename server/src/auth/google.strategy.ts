import { PassportStrategy } from "@nestjs/passport";
import { Strategy, VerifyCallback } from "passport-google-oauth20";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { writeDebugLog } from "./auth-logger";
import { User } from "../database/entities/user.entity";

interface GoogleProfile {
  id: string;
  emails?: Array<{ value: string }>;
  displayName?: string;
}

interface UserWithGoogleData extends Omit<User, "password" | "googleId"> {
  googleProfile?: GoogleProfile;
  googleAccessToken?: string;
  googleRefreshToken?: string;
  googleId?: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>("GOOGLE_CLIENT_ID"),
      clientSecret: configService.get<string>("GOOGLE_CLIENT_SECRET"),
      callbackURL: configService.get<string>("GOOGLE_REDIRECT_URI"),
      scope: [
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar",
        // Includes read + modify (labels, etc.)
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      // These need to be in authorizationParams, not here
    });

    // Override authorizationParams to ensure refresh token is requested
    // This is the correct way to pass access_type and prompt to Google's OAuth endpoint
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (
      this as {
        authorizationParams?: (options: unknown) => Record<string, string>;
      }
    ).authorizationParams = (
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _options: unknown,
    ) => ({
      access_type: "offline",
      prompt: "consent",
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: GoogleProfile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      this.logger.log(`[GoogleStrategy] OAuth callback received:`);
      this.logger.log(`  - accessToken: ${accessToken ? "[PRESENT]" : "NULL"}`);
      this.logger.log(
        `  - refreshToken: ${refreshToken ? "[PRESENT]" : "NULL"}`,
      );
      this.logger.log(`  - profile.id: ${profile.id}`);
      this.logger.log(
        `  - profile.email: ${profile.emails?.[0]?.value || "N/A"}`,
      );
      writeDebugLog(
        `[GoogleStrategy] OAuth callback - accessToken: ${accessToken ? "PRESENT" : "NULL"}, refreshToken: ${refreshToken ? "PRESENT" : "NULL"}`,
      );

      const user = await this.authService.validateGoogleUser(
        profile as any,
        accessToken,
        refreshToken,
      );

      // Attach raw Google data for connection flows
      const userWithGoogleData = user as UserWithGoogleData;
      userWithGoogleData.googleProfile = profile;
      userWithGoogleData.googleAccessToken = accessToken;
      userWithGoogleData.googleRefreshToken = refreshToken;
      userWithGoogleData.googleId = profile.id;

      done(null, userWithGoogleData);
    } catch (error) {
      done(error, false);
    }
  }
}
