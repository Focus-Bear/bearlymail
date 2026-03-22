import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import PgBoss from "pg-boss";

import {
  AUTH_CONSTANTS,
  TOKEN_BYTES,
  TOKEN_EXPIRY_MS,
} from "../constants/auth-constants";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { MINUTES_PER_HOUR } from "../constants/time-constants";
import { User } from "../database/entities/user.entity";
import { getJobPriority } from "../queue/job-priorities";
import { UsersService } from "../users/users.service";
import { logError } from "../utils/logger";
import { WaitlistService } from "../waitlist/waitlist.service";
import { AuthLogger, writeDebugLog } from "./auth-logger";
import { OAuthOnlyAccountException } from "./exceptions/oauth-only-account.exception";

const INITIAL_SYNC_DELAY_MS = 2000;

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

type UserWithoutPassword = Omit<User, "password">;

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
    // unknown email
    if (!user) return null;

    // OAuth-only account — no password hash set
    if (!user.password || user.password.length === 0) {
      throw new OAuthOnlyAccountException(email);
    }

    // wrong password
    if (!(await bcrypt.compare(password, user.password))) {
      return null;
    }

    // Check if user is approved
    if (!user.isApproved) {
      throw new Error(
        "Your account is pending approval. Please wait for admin approval.",
      );
    }

    const { password: _password, ...result } = user;
    return result;
  }

  async validateGoogleUser(
    profile: GoogleProfile,
    accessToken: string,
    refreshToken: string,
  ): Promise<UserWithoutPassword> {
    const email = profile.emails[0].value;
    const isJeremy = email.toLowerCase() === "jeremy@focusbear.io";
    let user = await this.usersService.findByEmail(email);
    const isNewUser = !user;

    await this.handleMissingRefreshToken(
      user,
      email,
      isJeremy,
      accessToken,
      profile.id,
      refreshToken,
    );

    if (!user) {
      user = await this.createGoogleUser(
        email,
        profile,
        accessToken,
        refreshToken,
        isJeremy,
      );
    } else {
      user = await this.updateGoogleUser(
        user,
        profile,
        accessToken,
        refreshToken,
        isJeremy,
      );
    }

    user = await this.checkWaitlistApproval(user, email, isJeremy);
    this.logLoginSuccess(user, isNewUser);
    this.scheduleSyncJobs(user.id);

    const { password: _password, ...result } = user;
    return result;
  }

  private async handleMissingRefreshToken(
    user: User | null,
    email: string,
    isJeremy: boolean,
    accessToken: string,
    profileId: string,
    refreshToken: string,
  ): Promise<void> {
    if (refreshToken) return;
    this.logger.error(
      `[LOGIN] CRITICAL: Google OAuth did not provide a refresh token for user ${email}`,
    );
    writeDebugLog(
      `[LOGIN] CRITICAL: Google OAuth did not provide a refresh token for user ${email}`,
    );
    if (!user) {
      throw new Error(
        "Google OAuth did not provide a refresh token. Please try logging in again. If the issue persists, you may need to revoke app access at https://myaccount.google.com/permissions and try again.",
      );
    }
    if (!user.googleCalendarRefreshToken) {
      this.logger.error(
        `[LOGIN] User ${user.id} has no refresh token and Google didn't provide one. Email sync will fail.`,
      );
      writeDebugLog(
        `[LOGIN] User ${user.id} has no refresh token and Google didn't provide one. Email sync will fail.`,
      );
      const updates: UserUpdateData = {
        googleId: profileId,
        googleCalendarAccessToken: accessToken,
        needsRelogin: true,
      };
      if (isJeremy) {
        updates.isApproved = true;
        updates.isAdmin = true;
      }
      await this.usersService.update(user.id, updates);
      const refreshedUser = await this.usersService.findOne(user.id);
      new AuthLogger().logAuthFailure(
        refreshedUser.id,
        refreshedUser.email || null,
        "LOGIN_MISSING_REFRESH_TOKEN",
        new Error("Google OAuth did not provide refresh token"),
        {
          hasAccessToken: true,
          hasRefreshToken: false,
          action:
            "User logged in but Google did not provide refresh token. Email sync will not work until user re-authenticates.",
        },
      );
      this.logger.warn(
        `[LOGIN] Login allowed but user ${user.id} will need to re-authenticate for email sync to work`,
      );
    } else {
      this.logger.log(
        `[LOGIN] Preserving existing refresh token since Google didn't provide a new one`,
      );
      writeDebugLog(
        `[LOGIN] Preserving existing refresh token since Google didn't provide a new one`,
      );
    }
  }

  private async createGoogleUser(
    email: string,
    profile: GoogleProfile,
    accessToken: string,
    refreshToken: string,
    isJeremy: boolean,
  ): Promise<User> {
    if (!refreshToken) {
      throw new Error(
        "Google OAuth did not provide a refresh token. Please try logging in again. If the issue persists, you may need to revoke app access at https://myaccount.google.com/permissions and try again.",
      );
    }
    const guessedName = profile.displayName || guessNameFromEmail(email);
    return this.usersService.create({
      email,
      name: guessedName,
      displayName: guessedName,
      password: "",
      googleId: profile.id,
      googleCalendarAccessToken: accessToken,
      googleCalendarRefreshToken: refreshToken,
      isApproved: isJeremy,
      isAdmin: isJeremy,
      needsRelogin: false,
    });
  }

  private async updateGoogleUser(
    user: User,
    profile: GoogleProfile,
    accessToken: string,
    refreshToken: string,
    isJeremy: boolean,
  ): Promise<User> {
    const updates: UserUpdateData = {
      googleId: profile.id,
      googleCalendarAccessToken: accessToken,
      ...(refreshToken ? { googleCalendarRefreshToken: refreshToken } : {}),
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
    const refreshedUser = await this.usersService.findOne(user.id);
    const logMsg4 = `[LOGIN] User re-fetched. Final updatedAt: ${refreshedUser.updatedAt?.toISOString() || "null"}`;
    this.logger.log(logMsg4);
    writeDebugLog(logMsg4);
    const logMsg5 = `[LOGIN] Final user state - hasRefreshToken: ${!!refreshedUser.googleCalendarRefreshToken}, hasAccessToken: ${!!refreshedUser.googleCalendarAccessToken}`;
    this.logger.log(logMsg5);
    writeDebugLog(logMsg5);
    return refreshedUser;
  }

  private async checkWaitlistApproval(
    user: User,
    email: string,
    isJeremy: boolean,
  ): Promise<User> {
    if (user.isApproved || isJeremy) return user;
    this.logger.log(
      `[LOGIN] User ${user.id} (${email}) is not approved, checking waitlist...`,
    );
    const waitlistEntry = await this.waitlistService.findByEmail(email);
    this.logger.log(
      `[LOGIN] Waitlist lookup result for ${email}: ${waitlistEntry ? `found (approved: ${waitlistEntry.approved})` : "not found"}`,
    );
    if (waitlistEntry?.approved) {
      this.logger.log(
        `[LOGIN] Auto-approving user ${user.id} - approved on waitlist`,
      );
      await this.usersService.update(user.id, { isApproved: true });
      const approvedUser = await this.usersService.findOne(user.id);
      this.logger.log(
        `[LOGIN] User ${approvedUser.id} auto-approved successfully, isApproved: ${approvedUser.isApproved}`,
      );
      return approvedUser;
    }
    if (waitlistEntry) {
      this.logger.warn(
        `[LOGIN] User ${email} is on waitlist but not approved yet`,
      );
      throw new Error(
        "Your account is pending approval. Please wait for admin approval.",
      );
    }
    this.logger.warn(`[LOGIN] User ${email} is not on the waitlist`);
    throw new Error(
      "You need to join the waitlist first. Please sign up at our website.",
    );
  }

  private logLoginSuccess(user: User, isNewUser: boolean): void {
    try {
      new AuthLogger().logAuthFailure(
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
    } catch (loginLogError) {
      logError(
        "Failed to log login success",
        loginLogError instanceof Error
          ? loginLogError
          : new Error(String(loginLogError)),
      );
    }
  }

  private scheduleSyncJobs(userId: string): void {
    setTimeout(() => {
      this.boss
        .send(
          "fetch-user-emails",
          { userId },
          {
            priority: getJobPriority("fetch-user-emails", false),
            singletonKey: `fetch-user-emails-${userId}`,
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
          { userId },
          {
            singletonKey: `sync-contacts-${userId}`,
            singletonMinutes: MINUTES_PER_HOUR,
          },
        )
        .catch((err) =>
          logError(
            "Failed to add contact sync job",
            err instanceof Error ? err : new Error(String(err)),
          ),
        );
    }, INITIAL_SYNC_DELAY_MS);
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

    const { password: _password, ...result } = user;
    return result;
  }

  /**
   * Initiates the forgot-password flow for a given email address.
   * Generates a time-limited reset token, stores it on the user record, and
   * queues a password-reset email via PgBoss. Always returns silently — we
   * never reveal whether the email is registered.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    // silent — don't reveal whether the email exists
    if (!user) return;

    const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
    // 1 hour from now
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

    await this.usersService.update(user.id, {
      passwordSetupToken: token,
      passwordSetupTokenExpiresAt: expiresAt,
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    await this.boss.send("send-password-reset-email", {
      userId: user.id,
      email: user.email,
      token,
      resetUrl: `${frontendUrl}/reset-password?token=${token}`,
    });

    this.logger.log(
      `[FORGOT_PASSWORD] Password reset email queued for user ${user.id}`,
    );
  }

  /**
   * Completes the password-reset flow using the token from the reset email.
   * Delegates to the existing setupPassword() logic, which validates the token,
   * hashes the new password, approves the user if not already approved, and
   * returns a valid login response.
   */
  async resetPassword(token: string, password: string) {
    return this.setupPassword(token, password);
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
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
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
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    return !!user.password && user.password.length > 0;
  }
}
