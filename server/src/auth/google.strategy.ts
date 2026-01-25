import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-google-oauth20";
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
    const clientID = configService.get<string>("GOOGLE_CLIENT_ID");
    const clientSecret = configService.get<string>("GOOGLE_CLIENT_SECRET");
    const callbackURL = configService.get<string>("GOOGLE_REDIRECT_URI");

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: [
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar",
        // Includes read + modify (labels, etc.)
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
        // Required for contacts sync via People API (explicit contacts)
        "https://www.googleapis.com/auth/contacts.readonly",
        // Required for "Other contacts" sync (auto-created from interactions)
        "https://www.googleapis.com/auth/contacts.other.readonly",
      ],
      // These need to be in authorizationParams, not here
    });

    // Log OAuth configuration status at startup
    this.logger.log(`[GoogleStrategy] Initialized with:`);
    this.logger.log(`  - clientID: ${clientID ? "[SET]" : "[MISSING]"}`);
    this.logger.log(
      `  - clientSecret: ${clientSecret ? "[SET]" : "[MISSING]"}`,
    );
    this.logger.log(`  - callbackURL: ${callbackURL || "[MISSING]"}`);
    writeDebugLog(
      `[GoogleStrategy] Initialized - clientID: ${clientID ? "SET" : "MISSING"}, clientSecret: ${clientSecret ? "SET" : "MISSING"}, callbackURL: ${callbackURL || "MISSING"}`,
    );

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
  ): Promise<UserWithGoogleData> {
    // NestJS Passport pattern: return user on success, throw error on failure
    // Do NOT call done() directly - NestJS Passport wrapper handles that
    this.logger.log(`[GoogleStrategy] OAuth callback received:`);
    this.logger.log(`  - accessToken: ${accessToken ? "[PRESENT]" : "NULL"}`);
    this.logger.log(`  - refreshToken: ${refreshToken ? "[PRESENT]" : "NULL"}`);
    this.logger.log(`  - profile.id: ${profile.id}`);
    this.logger.log(
      `  - profile.email: ${profile.emails?.[0]?.value || "N/A"}`,
    );
    writeDebugLog(
      `[GoogleStrategy] OAuth callback - accessToken: ${accessToken ? "PRESENT" : "NULL"}, refreshToken: ${refreshToken ? "PRESENT" : "NULL"}`,
    );

    try {
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

      return userWithGoogleData;
    } catch (error) {
      // Log the error for debugging
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `[GoogleStrategy] Authentication failed for ${profile.emails?.[0]?.value || "unknown"}: ${errorMessage}`,
      );

      // Throw the error - NestJS Passport will pass it to handleRequest
      throw error;
    }
  }
}
