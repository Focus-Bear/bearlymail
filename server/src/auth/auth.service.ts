import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import {
  BUSINESS_ANALYTICS_EVENTS,
  REGISTRATION_METHODS,
  RegistrationMethod,
} from "../constants/analytics-events";
import {
  AUTH_CONSTANTS,
  STEP_UP_TOKEN_EXPIRY_MINUTES,
} from "../constants/auth-constants";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { Office365Account } from "../database/entities/office365-account.entity";
import { PersonalAccessToken } from "../database/entities/personal-access-token.entity";
import { User } from "../database/entities/user.entity";
import { EmailBacklogService } from "../emails/email-backlog.service";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { revokeAllAccessTokens } from "../personal-access-tokens/revoke-all-access-tokens";
import { fetchUserEmailsJobKey } from "../queue/job-dedupe";
import { getJobPriority } from "../queue/job-priorities";
import { UsersService } from "../users/users.service";
import { logError } from "../utils/logger";
import { AuthLogger, writeDebugLog } from "./auth-logger";
import {
  EmailVerificationService,
  emailVerifiedFields,
} from "./email-verification.service";
import { DeletedAccountException } from "./exceptions/deleted-account.exception";
import { OAuthOnlyAccountException } from "./exceptions/oauth-only-account.exception";
import { GoogleProfile, isGoogleEmailVerified } from "./google-email-verified";
import { LoginLockoutService } from "./login-lockout.service";
import { hashEmailedToken } from "./token-hash.util";
import { TotpService, TotpSetupData } from "./totp.service";

const INITIAL_SYNC_DELAY_MS = 2000;

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

interface UserUpdateData extends GoogleGrantUpdates {
  googleId?: string;
  googleCalendarAccessToken?: string;
  googleCalendarRefreshToken?: string;
  needsRelogin?: boolean;
  isApproved?: boolean;
  isAdmin?: boolean;
}

interface GoogleSignInGrant {
  accessToken: string;
  refreshToken: string;
  isJeremy: boolean;
  grantUpdates: GoogleGrantUpdates;
}

type GoogleGrantUpdates = Partial<
  Pick<User, "googleGrantedScopes" | "gmailAccessIssue" | "gmailAccessIssueAt">
>;

/**
 * Columns a fresh Google grant updates besides the tokens. Scopes are only
 * recorded when Google reports them, so an omitted field never erases a
 * known grant. A grant that came with a refresh token has just been through
 * Google's consent screen with the Gmail boxes ticked (GoogleStrategy rejects
 * one without), so a recorded Gmail access issue is stale: clearing it here
 * lets onboarding show the fix at once instead of after the next sync.
 */
function buildGoogleGrantUpdates(
  refreshToken: string,
  grantedScopes: string | undefined,
): GoogleGrantUpdates {
  return {
    ...(grantedScopes !== undefined
      ? { googleGrantedScopes: grantedScopes }
      : {}),
    ...(refreshToken
      ? { gmailAccessIssue: null, gmailAccessIssueAt: null }
      : {}),
  };
}

interface MicrosoftLoginProfile {
  id: string;
  mail?: string;
  userPrincipalName?: string;
  displayName?: string;
}

/** Guest accounts carry `#EXT#` UPNs on the host tenant's domain. */
const MICROSOFT_GUEST_UPN_MARKER = "#ext#";

/**
 * The address a Microsoft sign-in may claim: its userPrincipalName, whose
 * domain Entra only allows if the tenant has verified it (for personal
 * Microsoft accounts it is the sign-in address Microsoft verified). `mail`
 * is never used: it's an unverified attribute any tenant admin can set.
 */
export function verifiedMicrosoftSignInEmail(
  profile: Pick<MicrosoftLoginProfile, "userPrincipalName">,
): string {
  const upn = (profile.userPrincipalName ?? "").trim();
  if (
    !upn.includes("@") ||
    upn.toLowerCase().includes(MICROSOFT_GUEST_UPN_MARKER)
  ) {
    throw new Error(
      "This Microsoft account has no verified sign-in address. Sign in another way, then connect Outlook from Settings.",
    );
  }
  return upn;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private totpService: TotpService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @Inject(forwardRef(() => EmailBacklogService))
    private emailBacklogService: EmailBacklogService,
    @Inject(forwardRef(() => OrganizationsService))
    private organizationsService: OrganizationsService,
    private emailVerificationService: EmailVerificationService,
    private loginLockout: LoginLockoutService,
    // Optional so sign-in never depends on analytics wiring. The module is
    // global, so the app always has it.
    @Optional() private readonly errorTracking?: ErrorTrackingService,
    // Optional so unit tests that don't touch passwords needn't provide it.
    @Optional()
    @InjectRepository(PersonalAccessToken)
    private readonly accessTokenRepository?: Repository<PersonalAccessToken>,
    @Optional()
    @InjectRepository(Office365Account)
    private readonly office365AccountRepository?: Repository<Office365Account>,
  ) {}

  /**
   * The BearlyMail user a Microsoft sign-in belongs to. A Microsoft identity
   * already linked to a user (by its immutable Graph id) wins. Otherwise the
   * account is matched by `userPrincipalName`, whose domain the tenant must
   * have verified — never by `mail`, which any tenant admin can set to anyone's
   * address ("nOAuth"), letting a self-made tenant sign in as that person.
   */
  private async findUserForMicrosoftLogin(
    profile: MicrosoftLoginProfile,
  ): Promise<{ user: User | null; email: string; matchedByAddress: boolean }> {
    const linked = this.office365AccountRepository
      ? await this.office365AccountRepository.findOne({
          where: { microsoftId: profile.id },
          order: { createdAt: "ASC" },
        })
      : null;
    if (linked) {
      const user = await this.usersService.findOne(linked.userId);
      if (user) return { user, email: user.email, matchedByAddress: false };
    }
    const email = verifiedMicrosoftSignInEmail(profile);
    return {
      user: await this.usersService.findByEmail(email),
      email,
      matchedByAddress: true,
    };
  }

  /**
   * A password change already invalidates session JWTs (jwt.strategy.ts);
   * this ends the MCP tokens and OAuth connections too, which would
   * otherwise keep an attacker's mailbox access alive after a reset.
   */
  private async revokeAccessTokensAfterPasswordChange(
    userId: string,
    now: Date,
  ): Promise<void> {
    if (!this.accessTokenRepository) return;
    const revoked = await revokeAllAccessTokens(
      this.accessTokenRepository,
      userId,
      now,
    );
    if (revoked > 0) {
      this.logger.log(
        `Revoked ${revoked} access token(s) for user ${userId} after a password change`,
      );
    }
  }

  /**
   * Sends `user_registered` for an OAuth sign-up, under the new user's ID (the
   * same ID the client identifies with) and with no PII. The client sends the
   * email sign-ups, so together one event counts every method.
   */
  private trackOAuthRegistration(
    userId: string,
    method: RegistrationMethod,
  ): void {
    this.errorTracking?.captureEvent(
      BUSINESS_ANALYTICS_EVENTS.USER_REGISTERED,
      userId,
      { method },
    );
  }

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
      this.loginLockout.recordUnknownEmailAttempt(emailHash);
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

    // While locked the password isn't checked at all.
    this.loginLockout.assertNotLocked(user);

    // OAuth-only account — no password hash set
    if (!user.password || user.password.length === 0) {
      throw new OAuthOnlyAccountException(email);
    }

    // wrong password
    if (!(await bcrypt.compare(password, user.password))) {
      await this.loginLockout.recordFailure(user.id);
      return null;
    }

    await this.loginLockout.recordSuccess(user);
    // Only after the password matched, so this never tells a stranger
    // anything about the account.
    await this.emailVerificationService.assertVerifiedForPasswordSignIn(user);
    await this.provisionPersonalOrg(user.id);
    const { password: _password, ...result } = user;
    return result;
  }

  async validateGoogleUser(
    profile: GoogleProfile,
    accessToken: string,
    refreshToken: string,
    grantedScopes?: string,
  ): Promise<UserWithoutPassword> {
    const email = profile.emails[0].value;
    if (!isGoogleEmailVerified(profile)) {
      throw new Error(
        "Google hasn't verified the email address on this account. Verify it with Google, or sign in another way.",
      );
    }
    const isJeremy = email.toLowerCase() === "jeremy@focusbear.io";
    let user = await this.usersService.findByEmail(email);
    const isNewUser = !user;
    if (user) {
      user = await this.emailVerificationService.claimForProviderSignIn(user);
    }

    await this.handleMissingRefreshToken({
      user,
      email,
      isJeremy,
      accessToken,
      profileId: profile.id,
      refreshToken,
    });

    const grantUpdates = buildGoogleGrantUpdates(refreshToken, grantedScopes);
    if (!user) {
      user = await this.createGoogleUser(email, profile, {
        accessToken,
        refreshToken,
        isJeremy,
        grantUpdates,
      });
      this.trackOAuthRegistration(user.id, REGISTRATION_METHODS.GOOGLE);
    } else {
      user = await this.updateGoogleUser(user, profile, {
        accessToken,
        refreshToken,
        isJeremy,
        grantUpdates,
      });
    }

    user = await this.ensureApproved(user);
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
    grant: GoogleSignInGrant,
  ): Promise<User> {
    const { accessToken, refreshToken, isJeremy, grantUpdates } = grant;
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
      isApproved: true,
      isAdmin: isJeremy,
      needsRelogin: false,
      emailVerifiedAt: new Date(),
      ...grantUpdates,
    });
  }

  private async updateGoogleUser(
    user: User,
    profile: GoogleProfile,
    grant: GoogleSignInGrant,
  ): Promise<User> {
    const { accessToken, refreshToken, isJeremy, grantUpdates } = grant;
    const updates: UserUpdateData = {
      ...grantUpdates,
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

  /**
   * Ensures a user is active (approved). Direct sign-up means every account is
   * approved on creation, but legacy accounts predating that change — and any
   * created before the backfill migration ran — may still be flagged
   * unapproved. This lazily approves them on login so no one is stranded.
   * Idempotent: a no-op for users already approved.
   */
  private async ensureApproved(user: User): Promise<User> {
    if (user.isApproved) return user;
    this.logger.log(
      `[LOGIN] Approving legacy unapproved user ${user.id} on login`,
    );
    await this.usersService.update(user.id, { isApproved: true });
    return this.usersService.findOne(user.id);
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
            singletonKey: fetchUserEmailsJobKey(userId),
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
    profile: MicrosoftLoginProfile,
    accessToken: string,
    refreshToken: string,
  ): Promise<UserWithoutPassword> {
    const found = await this.findUserForMicrosoftLogin(profile);
    const { email } = found;
    let { user } = found;
    // Only a match on the verified sign-in address vouches for the email; a
    // linked-identity match vouches for that link, not the account's address.
    if (user && found.matchedByAddress) {
      user = await this.emailVerificationService.claimForProviderSignIn(user);
    }

    const isJeremy = email.toLowerCase() === "jeremy@focusbear.io";

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
        isApproved: true,
        isAdmin: isJeremy,
        needsRelogin: false,
        emailVerifiedAt: new Date(),
      });
      this.trackOAuthRegistration(user.id, REGISTRATION_METHODS.MICROSOFT);
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

    user = await this.ensureApproved(user);
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

    // Zoho's account profile carries the primary address Zoho verified at
    // sign-up (or, from the Mail API fallback, the user's own Zoho mailbox).
    let user = await this.usersService.findByEmail(email);
    if (user) {
      user = await this.emailVerificationService.claimForProviderSignIn(user);
    }

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
        isApproved: true,
        isAdmin: isJeremy,
        needsRelogin: false,
        emailVerifiedAt: new Date(),
      });
      this.trackOAuthRegistration(user.id, REGISTRATION_METHODS.ZOHO);
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

    user = await this.ensureApproved(user);
    await this.provisionPersonalOrg(user.id);

    const { password: _password, ...result } = user;
    return result;
  }

  /**
   * Initiates the forgot-password flow: emails a short-lived reset link.
   * Always returns silently — we never reveal whether the email is registered.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return;
    await this.emailVerificationService.sendPasswordResetLink(user);
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
        emailVerifiedAt: new Date(),
      });
      this.logger.log(`Provisioned local Apple Mail user ${user.id}`);
    }
    return this.login(user);
  }

  /**
   * Direct sign-up: creates an approved but unverified account and emails a
   * verification link. No session is issued — password sign-in works once the
   * link has been followed.
   */
  async register(
    email: string,
    password: string,
    name?: string,
  ): Promise<{ verificationRequired: true }> {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      throw new BadRequestException("Email is required");
    }
    this.assertPasswordLength(password);

    const existing = await this.usersService.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException(
        "An account with this email already exists. Please sign in instead.",
      );
    }

    const isJeremy = normalizedEmail.toLowerCase() === "jeremy@focusbear.io";
    const hashedPassword = await bcrypt.hash(
      password,
      AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS,
    );
    const guessedName = name?.trim() || guessNameFromEmail(normalizedEmail);

    const created = await this.usersService.create({
      email: normalizedEmail,
      name: guessedName,
      displayName: guessedName,
      password: hashedPassword,
      isApproved: true,
      isAdmin: isJeremy,
      needsRelogin: false,
    });

    await this.emailVerificationService.sendVerification(created);
    this.logger.log(
      `[REGISTER] Created account for user ${created.id}; awaiting email verification`,
    );
    return { verificationRequired: true };
  }

  private assertPasswordLength(password: unknown): void {
    if (
      typeof password !== "string" ||
      password.length < AUTH_CONSTANTS.MIN_PASSWORD_LENGTH
    ) {
      throw new BadRequestException(
        `Password must be at least ${AUTH_CONSTANTS.MIN_PASSWORD_LENGTH} characters`,
      );
    }
  }

  /**
   * Completes an emailed password setup (waitlist approval) or reset link.
   * Only the token's SHA-256 is stored, so the lookup is one indexed equality
   * match. Following the link proves the address, so the account is marked
   * verified and any login lockout is cleared.
   */
  async setupPassword(token: string, password: string) {
    this.assertPasswordLength(password);
    const user =
      typeof token === "string" && token
        ? await this.usersService.findByPasswordSetupTokenHash(
            hashEmailedToken(token),
          )
        : null;
    if (!user) {
      throw new BadRequestException(
        "Invalid or expired setup token. Please contact support if you need a new link.",
      );
    }

    const hashedPassword = await bcrypt.hash(
      password,
      AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS,
    );

    const now = new Date();
    // Record when the password changed so previously issued JWTs are
    // invalidated (OWASP ASVS req 3.3.1 / 3.3.2).
    await this.usersService.update(user.id, {
      password: hashedPassword,
      passwordSetupTokenHash: null,
      passwordSetupTokenExpiresAt: null,
      isApproved: true,
      passwordChangedAt: now,
      failedLoginAttempts: 0,
      loginLockedUntil: null,
      ...(user.emailVerifiedAt ? {} : emailVerifiedFields(now)),
    });
    await this.revokeAccessTokensAfterPasswordChange(user.id, now);

    const updatedUser = await this.usersService.findOne(user.id);
    if (!updatedUser) {
      throw new Error("Failed to update user");
    }
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
    const changedAt = new Date();
    await this.usersService.update(userId, {
      password: hashedPassword,
      passwordChangedAt: changedAt,
    });
    await this.revokeAccessTokensAfterPasswordChange(userId, changedAt);

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
