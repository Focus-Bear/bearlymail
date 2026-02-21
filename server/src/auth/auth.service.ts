import {
  Injectable,
  Inject,
  Logger,
  UnauthorizedException,
  forwardRef,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import PgBoss from "pg-boss";
import { UsersService } from "../users/users.service";
import { WaitlistService } from "../waitlist/waitlist.service";
import * as bcrypt from "bcrypt";
import { writeDebugLog, AuthLogger } from "./auth-logger";
import { getJobPriority } from "../queue/job-priorities";
import { User } from "../database/entities/user.entity";
import { AUTH_CONSTANTS } from "../constants/auth-constants";
import { logError } from "../utils/logger";

interface GoogleProfile {
  id: string;
  emails: Array<{ value: string }>;
  displayName?: string;
}

function guessNameFromEmail(email: string): string {
  const localPart = email.split("@")[0];
  const nameParts = localPart
    .replace(/[._-]/g, " ")
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
  return nameParts.join(" ");
}

interface UserWithoutPassword extends Omit<User, "password"> {}

interface UserUpdateData {
  googleId?: string;
  googleCalendarAccessToken?: string;
  googleCalendarRefreshToken?: string;
  needsRelogin?: boolean;
  isApproved?: boolean;
  isAdmin?: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    @Inject(forwardRef(() => WaitlistService))
    private waitlistService: WaitlistService,
  ) {}

  async validateUser(
    email: string,
    password: string,
  ): Promise<UserWithoutPassword | null> {
    const user = await this.usersService.findByEmail(email);
    if (
      user &&
      user.password &&
      (await bcrypt.compare(password, user.password))
    ) {
      // Check if user is approved
      if (!user.isApproved) {
        throw new Error(
          "Your account is pending approval. Please wait for admin approval.",
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _password, ...result } = user;
      return result;
    }
    return null;
  }

  // eslint-disable-next-line max-lines-per-function, complexity, max-statements
  async validateGoogleUser(
    profile: GoogleProfile,
    accessToken: string,
    refreshToken: string,
  ): Promise<UserWithoutPassword> {
    const email = profile.emails[0].value;
    const isJeremy = email.toLowerCase() === "jeremy@focusbear.io";

    let user = await this.usersService.findByEmail(email);
    const isNewUser = !user;

    // Check if refresh token is missing - this is critical for email sync
    if (!refreshToken) {
      this.logger.error(
        `[LOGIN] CRITICAL: Google OAuth did not provide a refresh token for user ${email}`,
      );
      writeDebugLog(
        `[LOGIN] CRITICAL: Google OAuth did not provide a refresh token for user ${email}`,
      );

      // If this is a new user, we can't proceed without a refresh token
      if (isNewUser) {
        throw new Error(
          "Google OAuth did not provide a refresh token. Please try logging in again. If the issue persists, you may need to revoke app access at https://myaccount.google.com/permissions and try again.",
        );
      }

      // For existing users, check if they have a refresh token stored
      if (user && !user.googleCalendarRefreshToken) {
        // User has no refresh token stored AND Google didn't provide one
        // This means email sync will fail - set needsRelogin flag
        this.logger.error(
          `[LOGIN] User ${user.id} has no refresh token and Google didn't provide one. Email sync will fail.`,
        );
        writeDebugLog(
          `[LOGIN] User ${user.id} has no refresh token and Google didn't provide one. Email sync will fail.`,
        );

        // Update user with access token but mark as needing re-login
        const updates: UserUpdateData = {
          googleId: profile.id,
          googleCalendarAccessToken: accessToken,
          // Mark that user needs to re-authenticate to get refresh token
          needsRelogin: true,
        };
        if (isJeremy) {
          updates.isApproved = true;
          updates.isAdmin = true;
        }
        await this.usersService.update(user.id, updates);
        user = await this.usersService.findOne(user.id);

        // Log this as an auth failure so it shows up in auth-failures.log
        const authLogger = new AuthLogger();
        authLogger.logAuthFailure(
          user.id,
          user.email || null,
          "LOGIN_MISSING_REFRESH_TOKEN",
          new Error("Google OAuth did not provide refresh token"),
          {
            hasAccessToken: true,
            hasRefreshToken: false,
            action:
              "User logged in but Google did not provide refresh token. Email sync will not work until user re-authenticates.",
          },
        );

        // Don't throw error - allow login to proceed but user will see error message
        this.logger.warn(
          `[LOGIN] Login allowed but user ${user.id} will need to re-authenticate for email sync to work`,
        );
      } else if (user && user.googleCalendarRefreshToken) {
        // User has existing refresh token - preserve it
        this.logger.log(
          `[LOGIN] Preserving existing refresh token since Google didn't provide a new one`,
        );
        writeDebugLog(
          `[LOGIN] Preserving existing refresh token since Google didn't provide a new one`,
        );
      }
    }

    if (!user) {
      // Create new user - but we already checked for refresh token above
      if (!refreshToken) {
        // Can't create new user without refresh token - this is critical
        throw new Error(
          "Google OAuth did not provide a refresh token. Please try logging in again. If the issue persists, you may need to revoke app access at https://myaccount.google.com/permissions and try again.",
        );
      }
      const guessedName = profile.displayName || guessNameFromEmail(email);
      user = await this.usersService.create({
        email,
        name: guessedName,
        displayName: guessedName,
        // No password for Google users
        password: "",
        googleId: profile.id,
        googleCalendarAccessToken: accessToken,
        googleCalendarRefreshToken: refreshToken,
        // Auto-approve jeremy
        isApproved: isJeremy,
        // Make jeremy admin
        isAdmin: isJeremy,
        // New login = no need to relogin
        needsRelogin: false,
      });
    } else {
      // Update tokens for existing user
      // Also ensure jeremy is approved and admin
      const updates: UserUpdateData = {
        googleId: profile.id,
        googleCalendarAccessToken: accessToken,
        // Only update refresh token if we got a new one, otherwise preserve existing
        ...(refreshToken ? { googleCalendarRefreshToken: refreshToken } : {}),
        // Only clear if we got refresh token
        needsRelogin: refreshToken ? false : user.needsRelogin || false,
      };
      if (isJeremy) {
        updates.isApproved = true;
        updates.isAdmin = true;
      }
      const logMsg1 = `[LOGIN] Updating user ${user.id} with tokens. Current updatedAt: ${user.updatedAt?.toISOString() || "null"}`;
      this.logger.log(logMsg1);
      writeDebugLog(logMsg1);

      const logMsg2 = `[LOGIN] Updates to apply: ${JSON.stringify({ ...updates, googleCalendarAccessToken: updates.googleCalendarAccessToken ? "[REDACTED]" : null, googleCalendarRefreshToken: updates.googleCalendarRefreshToken ? "[REDACTED]" : null })}`;
      this.logger.log(logMsg2);
      writeDebugLog(logMsg2);

      const updatedUser = await this.usersService.update(user.id, updates);

      const logMsg3 = `[LOGIN] User updated. New updatedAt: ${updatedUser.updatedAt?.toISOString() || "null"}`;
      this.logger.log(logMsg3);
      writeDebugLog(logMsg3);

      user = await this.usersService.findOne(user.id);

      const logMsg4 = `[LOGIN] User re-fetched. Final updatedAt: ${user.updatedAt?.toISOString() || "null"}`;
      this.logger.log(logMsg4);
      writeDebugLog(logMsg4);

      const logMsg5 = `[LOGIN] Final user state - hasRefreshToken: ${!!user.googleCalendarRefreshToken}, hasAccessToken: ${!!user.googleCalendarAccessToken}`;
      this.logger.log(logMsg5);
      writeDebugLog(logMsg5);
    }

    // Check if user is approved (unless it's jeremy who was just auto-approved)
    if (!user.isApproved && !isJeremy) {
      // Check if user is on the waitlist and approved there
      this.logger.log(
        `[LOGIN] User ${user.id} (${email}) is not approved, checking waitlist...`,
      );
      const waitlistEntry = await this.waitlistService.findByEmail(email);
      this.logger.log(
        `[LOGIN] Waitlist lookup result for ${email}: ${waitlistEntry ? `found (approved: ${waitlistEntry.approved})` : "not found"}`,
      );
      if (waitlistEntry?.approved) {
        // User is approved on waitlist - auto-approve them for OAuth login
        this.logger.log(
          `[LOGIN] Auto-approving user ${user.id} - approved on waitlist`,
        );
        await this.usersService.update(user.id, { isApproved: true });
        user = await this.usersService.findOne(user.id);
        this.logger.log(
          `[LOGIN] User ${user.id} auto-approved successfully, isApproved: ${user.isApproved}`,
        );
      } else if (waitlistEntry) {
        // User is on waitlist but not yet approved
        this.logger.warn(
          `[LOGIN] User ${email} is on waitlist but not approved yet`,
        );
        throw new Error(
          "Your account is pending approval. Please wait for admin approval.",
        );
      } else {
        // User is not on the waitlist
        this.logger.warn(`[LOGIN] User ${email} is not on the waitlist`);
        throw new Error(
          "You need to join the waitlist first. Please sign up at our website.",
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...result } = user;

    // Log successful login
    try {
      const authLogger = new AuthLogger();
      authLogger.logAuthFailure(
        user.id,
        user.email || null,
        "LOGIN_SUCCESS",
        null,
        {
          isNewUser,
          hasRefreshToken: !!user.googleCalendarRefreshToken,
          hasAccessToken: !!user.googleCalendarAccessToken,
          action: "User successfully logged in via Google OAuth",
        },
      );
    } catch (logError) {
      logError(
        "Failed to log login success",
        logError instanceof Error ? logError : new Error(String(logError)),
      );
    }

    // Trigger email sync asynchronously via queue with a small delay to let tokens stabilize
    // Delay by 2 seconds to ensure tokens are fully saved in DB before sync attempts
    // Use singletonKey to prevent duplicate sync jobs for the same user
    setTimeout(() => {
      this.boss
        .send(
          "fetch-user-emails",
          { userId: user.id },
          {
            // Background fetch after login
            priority: getJobPriority("fetch-user-emails", false),
            singletonKey: `fetch-user-emails-${user.id}`,
            // Don't allow another fetch for same user within 5 minutes
            singletonMinutes: 5,
          },
        )
        .catch((err) =>
          logError(
            "Failed to add sync job",
            err instanceof Error ? err : new Error(String(err)),
          ),
        );

      this.boss
        .send(
          "sync-contacts",
          { userId: user.id },
          {
            singletonKey: `sync-contacts-${user.id}`,
            singletonMinutes: 60,
          },
        )
        .catch((err) =>
          logError(
            "Failed to add contact sync job",
            err instanceof Error ? err : new Error(String(err)),
          ),
        );
    }, 2000);

    return result;
  }

  async validateMicrosoftUser(
    profile: {
      id: string;
      mail?: string;
      userPrincipalName?: string;
      displayName?: string;
    },
    accessToken: string,
    refreshToken: string,
  ): Promise<UserWithoutPassword> {
    const email = profile.mail || profile.userPrincipalName || "";
    if (!email) {
      throw new Error("Microsoft profile does not contain email");
    }

    const isJeremy = email.toLowerCase() === "jeremy@focusbear.io";

    let user = await this.usersService.findByEmail(email);

    if (!user) {
      // Create new user
      if (!refreshToken) {
        throw new Error(
          "Microsoft OAuth did not provide a refresh token. Please try logging in again.",
        );
      }
      const guessedName = profile.displayName || guessNameFromEmail(email);
      user = await this.usersService.create({
        email,
        name: guessedName,
        displayName: guessedName,
        password: "",
        // Don't store tokens on user - they go in Office365Account entity
        isApproved: isJeremy,
        isAdmin: isJeremy,
        needsRelogin: false,
      });
    } else {
      // Update existing user
      const updates: UserUpdateData = {};
      if (isJeremy) {
        updates.isApproved = true;
        updates.isAdmin = true;
      }
      if (Object.keys(updates).length > 0) {
        await this.usersService.update(user.id, updates);
        user = await this.usersService.findOne(user.id);
      }
    }

    if (!user.isApproved && !isJeremy) {
      // Check if user is on the waitlist and approved there
      const waitlistEntry = await this.waitlistService.findByEmail(email);
      if (waitlistEntry?.approved) {
        // User is approved on waitlist - auto-approve them for OAuth login
        this.logger.log(
          `[LOGIN] Auto-approving user ${user.id} - approved on waitlist`,
        );
        await this.usersService.update(user.id, { isApproved: true });
        user = await this.usersService.findOne(user.id);
      } else if (waitlistEntry) {
        // User is on waitlist but not yet approved
        throw new Error(
          "Your account is pending approval. Please wait for admin approval.",
        );
      } else {
        // User is not on the waitlist
        throw new Error(
          "You need to join the waitlist first. Please sign up at our website.",
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...result } = user;
    return result;
  }

  async validateZohoUser(
    profile: { ZUID: string; Email: string; Display_Name?: string },
    accessToken: string,
    refreshToken: string,
  ): Promise<UserWithoutPassword> {
    const email = profile.Email;
    if (!email) {
      throw new Error("Zoho profile does not contain email");
    }

    const isJeremy = email.toLowerCase() === "jeremy@focusbear.io";

    let user = await this.usersService.findByEmail(email);

    if (!user) {
      // Create new user
      if (!refreshToken) {
        throw new Error(
          "Zoho OAuth did not provide a refresh token. Please try logging in again.",
        );
      }
      const guessedName = profile.Display_Name || guessNameFromEmail(email);
      user = await this.usersService.create({
        email,
        name: guessedName,
        displayName: guessedName,
        password: "",
        // Don't store tokens on user - they go in ZohoAccount entity
        isApproved: isJeremy,
        isAdmin: isJeremy,
        needsRelogin: false,
      });
    } else {
      // Update existing user
      const updates: UserUpdateData = {};
      if (isJeremy) {
        updates.isApproved = true;
        updates.isAdmin = true;
      }
      if (Object.keys(updates).length > 0) {
        await this.usersService.update(user.id, updates);
        user = await this.usersService.findOne(user.id);
      }
    }

    if (!user.isApproved && !isJeremy) {
      // Check if user is on the waitlist and approved there
      const waitlistEntry = await this.waitlistService.findByEmail(email);
      if (waitlistEntry?.approved) {
        // User is approved on waitlist - auto-approve them for OAuth login
        this.logger.log(
          `[LOGIN] Auto-approving user ${user.id} - approved on waitlist`,
        );
        await this.usersService.update(user.id, { isApproved: true });
        user = await this.usersService.findOne(user.id);
      } else if (waitlistEntry) {
        // User is on waitlist but not yet approved
        throw new Error(
          "Your account is pending approval. Please wait for admin approval.",
        );
      } else {
        // User is not on the waitlist
        throw new Error(
          "You need to join the waitlist first. Please sign up at our website.",
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...result } = user;
    return result;
  }

  async login(user: UserWithoutPassword) {
    // Check if user is approved before allowing login
    // In development mode, auto-approve if not already approved
    const isDev = process.env.NODE_ENV !== "production";
    if (!user.isApproved) {
      if (isDev) {
        // Auto-approve in dev mode
        this.logger.log(`Auto-approving user ${user.id} in development mode`);
        await this.usersService.update(user.id, { isApproved: true });
        user.isApproved = true;
      } else {
        throw new UnauthorizedException(
          "Your account is pending approval. Please wait for admin approval.",
        );
      }
    }

    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        needsRelogin: user.needsRelogin,
        hasSeenTour: user.hasSeenTour,
        hasScannedHistory: user.hasScannedHistory,
        isAdmin: user.isAdmin,
        isApproved: user.isApproved,
        termsAcceptedAt: user.termsAcceptedAt,
        privacyAcceptedAt: user.privacyAcceptedAt,
        termsVersion: user.termsVersion,
        privacyVersion: user.privacyVersion,
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async register(_email: string, _password: string, _name?: string) {
    // Registration is disabled - users must join waitlist first
    throw new Error(
      "Registration is currently closed. Please join our waitlist first.",
    );
  }

  async setupPassword(token: string, password: string) {
    // Find user by password setup token using a query
    // Note: We need to query all users and filter in memory since passwordSetupToken is not indexed
    // In production, consider adding an index or using a separate table for tokens
    const users = await this.usersService.findAll();
    const user = users.find(
      (userItem) =>
        userItem.passwordSetupToken === token &&
        userItem.passwordSetupTokenExpiresAt &&
        userItem.passwordSetupTokenExpiresAt > new Date(),
    );

    if (!user) {
      throw new Error(
        "Invalid or expired setup token. Please contact support if you need a new link.",
      );
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(
      password,
      AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS,
    );

    // Update user with password and approve them
    await this.usersService.update(user.id, {
      password: hashedPassword,
      passwordSetupToken: null,
      passwordSetupTokenExpiresAt: null,
      isApproved: true,
    });

    // Refetch the user
    const updatedUser = await this.usersService.findOne(user.id);
    if (!updatedUser) {
      throw new Error("Failed to update user");
    }

    // Log them in
    return this.login(updatedUser);
  }

  /**
   * Set password for an authenticated SSO user.
   * This allows users who logged in via Google/Microsoft/Zoho to also have a password
   * so they can login with either method.
   */
  async setPasswordForSsoUser(userId: string, password: string): Promise<void> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Validate password length
    if (password.length < AUTH_CONSTANTS.MIN_PASSWORD_LENGTH) {
      throw new Error(
        `Password must be at least ${AUTH_CONSTANTS.MIN_PASSWORD_LENGTH} characters long`,
      );
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(
      password,
      AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS,
    );

    // Update user with password
    await this.usersService.update(userId, {
      password: hashedPassword,
    });

    this.logger.log(
      `[SET_PASSWORD] User ${userId} successfully set a password for their account`,
    );
    writeDebugLog(
      `[SET_PASSWORD] User ${userId} successfully set a password for their account`,
    );
  }

  /**
   * Check if the authenticated user has a password set.
   */
  async hasPassword(userId: string): Promise<boolean> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new Error("User not found");
    }
    return !!user.password && user.password.length > 0;
  }
}
