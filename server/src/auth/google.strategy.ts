import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-google-oauth20";

import {
  findMissingRequiredGoogleScopes,
  GOOGLE_OAUTH_SCOPES,
  MISSING_GMAIL_PERMISSION_MESSAGE,
} from "../constants/google-oauth-scopes";
import { User } from "../database/entities/user.entity";
import { AuthService } from "./auth.service";
import { writeDebugLog } from "./auth-logger";

/**
 * Google OAuth profile from passport-google-oauth20
 * Note: emails is optional in the OAuth response but required by validateGoogleUser
 */
interface GoogleOAuthProfile {
  id: string;
  emails?: Array<{ value: string }>;
  displayName?: string;
}

/**
 * Profile type expected by AuthService.validateGoogleUser
 */
interface GoogleProfileForValidation {
  id: string;
  emails: Array<{ value: string }>;
  displayName?: string;
}

/**
 * Raw token-response fields passport-oauth2 hands to `validate` (only when the
 * strategy is registered with a callback arity that includes them).
 */
interface GoogleTokenParams {
  scope?: string;
}

interface UserWithGoogleData extends Omit<User, "password" | "googleId"> {
  googleProfile?: GoogleOAuthProfile;
  googleAccessToken?: string;
  googleRefreshToken?: string;
  googleId?: string;
}

// Arity `true` makes passport-oauth2 pass the token response (`params`) to
// validate, which is the only place Google reports which scopes were granted.
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google", true) {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const clientID = configService.get<string>("GOOGLE_CLIENT_ID");
    const clientSecret = configService.get<string>("GOOGLE_CLIENT_SECRET");
    const callbackURL = configService.get<string>("GOOGLE_REDIRECT_URI");

    super({
      clientID: clientID || "placeholder-client-id",
      clientSecret: clientSecret || "placeholder-client-secret",
      callbackURL: callbackURL || "http://localhost:3001/auth/google/callback",
      scope: GOOGLE_OAUTH_SCOPES,
      // These need to be in authorizationParams, not here
    });

    if (!clientID || !clientSecret || !callbackURL) {
      this.logger.warn(
        "Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI environment variables.",
      );
    }

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
    // The Strategy class has this method but it's not in the TypeScript definition
    type StrategyWithAuthParams = typeof this & {
      authorizationParams?: (options: unknown) => Record<string, string>;
    };
    (this as StrategyWithAuthParams).authorizationParams = () => ({
      access_type: "offline",
      prompt: "consent",
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    params: GoogleTokenParams,
    profile: GoogleOAuthProfile,
  ): Promise<UserWithGoogleData> {
    // NestJS Passport pattern: return user on success, throw error on failure
    // Do NOT call done() directly - NestJS Passport wrapper handles that
    this.logger.log(`[GoogleStrategy] OAuth callback received:`);
    this.logger.log(`  - accessToken: ${accessToken ? "[PRESENT]" : "NULL"}`);
    this.logger.log(`  - refreshToken: ${refreshToken ? "[PRESENT]" : "NULL"}`);
    this.logger.log(`  - profile.id: ${profile.id}`);
    // Email is PII (encrypted at rest everywhere else) — log presence only.
    this.logger.log(
      `  - profile.email: ${profile.emails?.[0]?.value ? "[PRESENT]" : "N/A"}`,
    );
    writeDebugLog(
      `[GoogleStrategy] OAuth callback - accessToken: ${accessToken ? "PRESENT" : "NULL"}, refreshToken: ${refreshToken ? "PRESENT" : "NULL"}`,
    );

    // Reject before validateGoogleUser so a token that can't read mail never
    // creates the account or replaces a previously complete grant.
    const missingScopes = findMissingRequiredGoogleScopes(params?.scope);
    if (missingScopes.length > 0) {
      this.logger.warn(
        `[GoogleStrategy] Sign-in for profile ${profile.id} declined required scopes: ${missingScopes.join(", ")}`,
      );
      throw new Error(MISSING_GMAIL_PERMISSION_MESSAGE);
    }

    try {
      // Validate that profile has required emails before calling validateGoogleUser
      if (!profile.emails || profile.emails.length === 0) {
        throw new Error("Google profile missing email address");
      }
      // Now we can safely cast to the type expected by validateGoogleUser
      const profileForValidation: GoogleProfileForValidation = {
        id: profile.id,
        emails: profile.emails,
        displayName: profile.displayName,
      };
      const user = await this.authService.validateGoogleUser(
        profileForValidation,
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
