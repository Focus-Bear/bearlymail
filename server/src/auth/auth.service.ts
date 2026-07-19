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
import type { PgBoss } from "pg-boss";

import {
  AUTH_CONSTANTS,
  STEP_UP_TOKEN_EXPIRY_MINUTES,
  TOKEN_BYTES,
  TOKEN_EXPIRY_MS,
} from "../constants/auth-constants";
import { NODE_ENV_VALUES } from "../constants/domain-types";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { User } from "../database/entities/user.entity";
import { EmailBacklogService } from "../emails/email-backlog.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { getJobPriority } from "../queue/job-priorities";
import { UsersService } from "../users/users.service";
import { logError } from "../utils/logger";
import { WaitlistService } from "../waitlist/waitlist.service";
import { AuthLogger, writeDebugLog } from "./auth-logger";
import { DeletedAccountException } from "./exceptions/deleted-account.exception";
import { OAuthOnlyAccountException } from "./exceptions/oauth-only-account.exception";
import { TotpService, TotpSetupData } from "./totp.service";

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
    private totpService: TotpService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @Inject(forwardRef(() => WaitlistService))
    private waitlistService: WaitlistService,
    @Inject(forwardRef(() => EmailBacklogService))
    private emailBacklogService: EmailBacklogService,
    @Inject(forwardRef(() => OrganizationsService))
    private organizationsService: OrganizationsService,
  ) {}

  /**
   * Best-effort provisioning of the user's "org of one". Runs on every successful
   * login so existing users are backfilled lazily and new users get an org
   * immediately. Never blocks login — a failure here is logged and swallowed
   * (the backfill migration and the next login both act as safety nets).
   */
  private async provisionPersonalOrg(userId: string): Promise<void> {
    try {
      await this.organizationsService.ensurePersonalOrg(userId);
    } catch (err) {
      this.logger.error(
        `Failed to provision personal org for user ${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async validateUser(
    email: string,
    password: string,
  ): Promise<UserWithoutPassword | null> {
    const user = await this.usersService.findByEmail(email);

    // No active account — check if this email belonged to a deleted account.
    // If the password also matches we show an informative "data deleted" message.
    if (!user) {
      const emailHash = this.usersService.hashEmail(email);
      const deleted =
        await this.usersService.findDeletedAccountByEmailHash(emailHash);
      if (deleted?.passwordHash) {
        const passwordMatches = await bcrypt.compare(
          password,
          deleted.passwordHash,
        );
        if (passwordMatches) {
          throw new DeletedAccountException(deleted.deletionReason);
        }
      }
      return null;
    }

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

    await this.handleMissingRefreshToken({
      user,
      email,
      isJeremy,
      accessToken,
      profileId: profile.id,
      refreshToken,
    });

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
    await this.provisionPersonalOrg(user.id);
    this.logLoginSuccess(user, isNewUser);
    this.scheduleSyncJobs(user.id);

    const { password: _password, ...result } = user;
    return result;
  }

  private async handleMissingRefreshToken(options: {
    user: User | null;
    email: string;
    isJeremy: boolean;
    accessToken: string;
    profileId: string;
    refreshToken: string;
  }): Promise<void> {
    const { user, email, isJeremy, accessToken, profileId, refreshToken } =
      options;
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
          JOB_NAMES.FETCH_USER_EMAILS,
          { userId },
          {
            priority: getJobPriority(JOB_NAMES.FETCH_USER_EMAILS, false),
            singletonKey: `fetch-user-emails-${userId}`,
            singletonSeconds: SECONDS.FIVE_MINUTES,
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
          JOB_NAMES.SYNC_CONTACTS,
          { userId },
          {
            singletonKey: `sync-contacts-${userId}`,
            singletonSeconds: SECONDS.HOUR,
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

    await this.provisionPersonalOrg(user.id);

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

    await this.provisionPersonalOrg(user.id);

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
    const isDev = process.env.NODE_ENV !== NODE_ENV_VALUES.PRODUCTION;
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

    const wasInactive = await this.usersService.wasUserInactive(user.id);
    await this.usersService.updateLastActivity(user.id);

    // Drain deferred AI processing on every login, not only after inactivity:
    // threads are also deferred by the org volume cap, which hits users who are
    // active daily and would otherwise never get their backlog processed.
    this.emailBacklogService
      .queueBacklogProcessing(user.id)
      .then(({ threadCount }) => {
        if (threadCount > 0) {
          this.logger.log(
            `[LOGIN] User ${user.id} (${wasInactive ? "was inactive" : "active"}) — queued backlog processing for ${threadCount} deferred threads`,
          );
        }
      })
      .catch((err) =>
        this.logger.error(
          `Failed to queue backlog processing for user ${user.id}:`,
          err,
        ),
      );

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
        syncWindowLimited: user.syncWindowLimited,
        isAdmin: user.isAdmin,
        isApproved: user.isApproved,
        termsAcceptedAt: user.termsAcceptedAt,
        privacyAcceptedAt: user.privacyAcceptedAt,
        termsVersion: user.termsVersion,
        privacyVersion: user.privacyVersion,
      },
    };
  }

  /**
   * Passwordless login for local-only Apple Mail mode. Finds (or provisions)
   * the local user identified by LOCAL_USER_EMAIL and returns a session, so a
   * user running BearlyMail on their own Mac can click "Continue with Apple
   * Mail" instead of copying a generated password.
   *
   * SECURITY: this must only ever be reached through the gate in
   * AuthController.appleMailLocalLogin (non-production + macOS + localhost).
   * It does not verify any credential, so it is safe only there.
   */
  async loginLocalAppleMailUser() {
    const email = (
      process.env.LOCAL_USER_EMAIL || "local@bearlymail.local"
    ).toLowerCase();
    let user = await this.usersService.findByEmail(email);
    if (!user) {
      // Left NOT-onboarded on purpose: the client shows the setup wizard
      // (batching preferences + AI training) on first "Continue with Apple
      // Mail", and marks it complete via POST /onboarding/complete.
      user = await this.usersService.create({
        email,
        name: "Local User",
        password: "",
        isApproved: true,
      });
      this.logger.log(`Provisioned local Apple Mail user ${user.id}`);
    }
    return this.login(user);
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

    // Use constant-time comparison to prevent timing attacks on token values
    // (OWASP ASVS req 2.9.3 / 6.2.7).
    // Hash both values to a fixed 32-byte length with SHA-256 before comparing so
    // that timingSafeEqual always runs in constant time with no early exit on length mismatch.
    const tokenHash = crypto.createHash("sha256").update(token).digest();
    const user = users.find((userItem) => {
      if (
        !userItem.passwordSetupToken ||
        !userItem.passwordSetupTokenExpiresAt ||
        userItem.passwordSetupTokenExpiresAt <= new Date()
      ) {
        return false;
      }
      const storedHash = crypto
        .createHash("sha256")
        .update(userItem.passwordSetupToken)
        .digest();
      return crypto.timingSafeEqual(storedHash, tokenHash);
    });

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

    const now = new Date();
    // Update user with password, approve them, and record when password changed
    // so that any previously issued JWTs are invalidated (OWASP ASVS req 3.3.1 / 3.3.2)
    await this.usersService.update(user.id, {
      password: hashedPassword,
      passwordSetupToken: null,
      passwordSetupTokenExpiresAt: null,
      isApproved: true,
      passwordChangedAt: now,
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
        `Password must be at least ${AUTH_CONSTANTS.MIN_PASSWORD_LENGTH} characters`,
      );
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(
      password,
      AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS,
    );

    // Update password and record change timestamp so existing JWTs are invalidated
    // (OWASP ASVS req 3.3.1 / 3.3.2)
    await this.usersService.update(userId, {
      password: hashedPassword,
      passwordChangedAt: new Date(),
    });

    this.logger.log(
      `[SET_PASSWORD] User ${userId} successfully set a password for their account`,
    );
    writeDebugLog(
      `[SET_PASSWORD] User ${userId} successfully set a password for their account`,
    );
  }

  /**
   * Issues a short-lived step-up token (15 min) after verifying the user's password.
   *
   * OAuth-only users (no password set) receive a token without password verification —
   * their valid JWT is sufficient proof of identity for this session.
   *
   * The resulting token must be sent in the X-Step-Up-Token header when calling
   * sensitive endpoints protected by StepUpAuthGuard.
   * (OWASP ASVS req 4.2.1)
   */
  async issueStepUpToken(userId: string, password?: string): Promise<string> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    const isPasswordUser = !!user.password && user.password.length > 0;

    if (isPasswordUser) {
      if (!password) {
        throw new UnauthorizedException({ requiresPassword: true });
      }
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        throw new UnauthorizedException("Invalid password");
      }
    }

    const payload = { sub: userId, stepUp: true };
    return this.jwtService.sign(payload, {
      expiresIn: `${STEP_UP_TOKEN_EXPIRY_MINUTES}m`,
    });
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

  // ─── MFA / TOTP ────────────────────────────────────────────────────────────

  /**
   * Initiate MFA setup: generate a TOTP secret and QR code for the user.
   * MFA is NOT yet active — the user must verify a code via enableMfa().
   */
  async setupMfa(userId: string): Promise<TotpSetupData> {
    return this.totpService.setupMfa(userId);
  }

  /**
   * Verify the first TOTP code and activate MFA for the user.
   */
  async enableMfa(userId: string, token: string): Promise<boolean> {
    return this.totpService.enableMfa(userId, token);
  }

  /**
   * Verify a TOTP token and, if valid, return an MFA-elevated JWT.
   *
   * The elevated JWT carries `mfaVerified: true` and `mfaVerifiedAt` (epoch ms)
   * and keeps the SAME lifetime as a normal session token (7d). MFA elevation is
   * enforced as a recency window (MFA_ELEVATION_TTL_MS) by AdminGuard, not by the
   * token/cookie expiring — so a stale elevation prompts re-verification for admin
   * endpoints instead of logging the user out of the whole app (SAQ Q35 / GAP-2).
   */
  async verifyMfaAndElevate(
    userId: string,
    email: string,
    token: string,
  ): Promise<{ access_token: string } | null> {
    const valid = await this.totpService.verifyMfa(userId, token);
    if (!valid) return null;

    const elevatedToken = this.jwtService.sign({
      sub: userId,
      email,
      mfaVerified: true,
      mfaVerifiedAt: Date.now(),
    });
    this.logger.log(`[MFA] Elevated JWT issued for user ${userId}`);
    return { access_token: elevatedToken };
  }

  /**
   * Disable MFA after verifying the current TOTP code.
   */
  async disableMfa(userId: string, token: string): Promise<boolean> {
    return this.totpService.disableMfa(userId, token);
  }

  /**
   * Return the MFA enabled status for the authenticated user.
   */
  async getMfaStatus(userId: string): Promise<{ enabled: boolean }> {
    return this.totpService.getMfaStatus(userId);
  }
}
