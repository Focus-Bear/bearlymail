import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, LessThan, Repository } from "typeorm";

import { writeDebugLog } from "../auth/auth-logger";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { MILLISECONDS, MINUTES } from "../constants/time-constants";
import {
  DeletedAccount,
  DeletionReason,
} from "../database/entities/deleted-account.entity";
import { User } from "../database/entities/user.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";

const DEFAULT_INACTIVITY_THRESHOLD_DAYS = 3;
const RECENT_LOGIN_GRACE_MS = MINUTES.FIVE * MILLISECONDS.MINUTE;

/**
 * Stack-frame window captured for `[NEEDS_RELOGIN]` diagnostics. We skip the
 * first two frames (the Error constructor + `logNeedsReloginFlip` itself) and
 * keep the next few callers — enough to identify the originating code path
 * without dumping the entire stack.
 */
const NEEDS_RELOGIN_STACK_START = 2;
const NEEDS_RELOGIN_STACK_END = 8;

function getInactivityThresholdDays(): number {
  const envVal = parseInt(process.env.AI_INACTIVITY_THRESHOLD_DAYS ?? "", 10);
  return Number.isFinite(envVal) && envVal > 0
    ? envVal
    : DEFAULT_INACTIVITY_THRESHOLD_DAYS;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(DeletedAccount)
    private deletedAccountRepository: Repository<DeletedAccount>,
  ) {}

  /**
   * Central diagnostic for the recurring "logged out again" reports.
   *
   * Every code path that forces a user back to the login screen ends up calling
   * `update(id, { needsRelogin: true })`, so logging here guarantees we capture
   * ALL of them — even callers that don't log themselves. We emit a single
   * greppable `[NEEDS_RELOGIN]` line (at WARN so it survives the worker's
   * `["log","error","warn"]` level filter and reaches CloudWatch) with a trimmed
   * caller stack identifying exactly which path tripped the flag.
   */
  private logNeedsReloginFlip(
    id: string,
    updates: Partial<User>,
    previous: User,
  ): void {
    if (updates.needsRelogin !== true || previous.needsRelogin === true) return;
    const otherFields = Object.keys(updates).filter(
      (key) => key !== "needsRelogin",
    );
    const callerStack = (new Error().stack ?? "")
      .split("\n")
      .slice(NEEDS_RELOGIN_STACK_START, NEEDS_RELOGIN_STACK_END)
      .map((line) => line.trim())
      .join(" <- ");
    this.logger.warn(
      `[NEEDS_RELOGIN] user=${id} ` +
        `coUpdatedFields=[${otherFields.join(",")}] caller: ${callerStack || "unavailable"}`,
    );
  }

  /**
   * Flag a user as needing re-login and record *why*, for the admin logout
   * diagnostics view. Use this instead of `update(id, { needsRelogin: true })`
   * at every forced-logout site so the reason is always captured. The reason is
   * a short machine code (e.g. "gmail_invalid_token"), never PII.
   *
   * Centralised guards:
   *   - skip if the user just logged in (5-min grace window) — avoids false
   *     logouts when token propagation hasn't settled yet
   *   - skip if `needsRelogin` is already true — avoids redundant DB writes
   *     and `[NEEDS_RELOGIN]` log spam
   *
   * Emits a WARN line (visible in CloudWatch) — file-based debug logging is a
   * no-op in production, so console logging is the only reliable signal there.
   */
  async markNeedsRelogin(userId: string, reason: string): Promise<void> {
    const user = await this.findOneLightweight(userId);
    if (!user) return;

    const recentLoginCutoff = new Date(Date.now() - RECENT_LOGIN_GRACE_MS);
    const isRecentLogin =
      !!user.updatedAt && user.updatedAt > recentLoginCutoff;
    if (isRecentLogin || user.needsRelogin) return;

    this.logger.warn(`[NEEDS_RELOGIN] user=${userId} reason=${reason}`);
    await this.update(userId, {
      needsRelogin: true,
      lastLogoutReason: reason,
      lastLogoutAt: new Date(),
    });
  }

  /**
   * Flags that the user's initial email sync skipped older mail because of the
   * sync-window policy (500-email cap / 7-day window). Read by the client via
   * GET /users/me to show the "we're not syncing your old emails" banner.
   */
  async markSyncWindowLimited(userId: string): Promise<void> {
    this.logger.log(
      `[SYNC_WINDOW] user=${userId} initial sync skipped older mail — setting syncWindowLimited`,
    );
    await this.update(userId, { syncWindowLimited: true });
  }

  async create(userData: Partial<User>): Promise<User> {
    // Generate email hash if email is provided
    if (userData.email && !userData.emailHash) {
      userData.emailHash = EncryptionHelper.hashEmail(userData.email);
    }
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  /**
   * @deprecated Use optimized methods like findOneForAuth, findOneWithTokens, or findOneWithApiKey instead
   * This method selects all columns including encrypted ones, which is slow.
   */
  async findOne(id: string): Promise<User> {
    return this.userRepository.findOne({ where: { id } });
  }

  /**
   * Lightweight query - selects only non-encrypted, frequently-used columns.
   * Use when you need basic user info without encrypted fields.
   */
  async findOneLightweight(id: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder("user")
      .select([
        "user.id",
        "user.emailHash",
        "user.isAdmin",
        "user.isApproved",
        "user.needsRelogin",
        "user.hasSeenTour",
        "user.hasScannedHistory",
        "user.scanProgress",
        "user.scanTotal",
        "user.subscriptionStatus",
        "user.subscriptionExpiresAt",
        "user.trialStartedAt",
        "user.lastEmailSyncAt",
        "user.createdAt",
        "user.updatedAt",
      ])
      .where("user.id = :id", { id })
      .getOne();
  }

  /**
   * Optimized for JWT validation - selects only id, email, isAdmin, isApproved.
   * Use in authentication flows where you only need basic user info.
   */
  /**
   * Optimized for summarisation: the account owner's email + name so the
   * summary prompt can anchor "you" to the real person (prevents the summary
   * from referring to the account owner by name or inverting who sent what).
   * Name/displayName are encrypted columns — the transformer decrypts them.
   */
  async findOneForSummary(
    id: string,
  ): Promise<Pick<User, "email" | "name" | "displayName"> | null> {
    return this.userRepository
      .createQueryBuilder("user")
      .select(["user.id", "user.email", "user.name", "user.displayName"])
      .where("user.id = :id", { id })
      .getOne();
  }

  async findOneForAuth(
    id: string,
  ): Promise<
    | (User & { lastActivityAt: Date | null; passwordChangedAt: Date | null })
    | null
  > {
    return this.userRepository
      .createQueryBuilder("user")
      .select([
        "user.id",
        "user.email",
        "user.isAdmin",
        "user.isApproved",
        "user.lastActivityAt",
        "user.passwordChangedAt",
      ])
      .where("user.id = :id", { id })
      .getOne() as Promise<
      | (User & {
          lastActivityAt: Date | null;
          passwordChangedAt: Date | null;
        })
      | null
    >;
  }

  /**
   * Optimized for Gmail provider - selects id + Google calendar tokens + email + updatedAt.
   * Use when you only need Google calendar access/refresh tokens (email and updatedAt included for logging).
   */
  async findOneWithTokens(id: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder("user")
      .select([
        "user.id",
        "user.email",
        "user.googleCalendarAccessToken",
        "user.googleCalendarRefreshToken",
        "user.lastEmailSyncAt",
        "user.updatedAt",
        "user.needsRelogin",
      ])
      .where("user.id = :id", { id })
      .getOne();
  }

  /**
   * Optimized for LLM services - selects id + openAiApiKey.
   * Use when you only need the OpenAI API key.
   */
  async findOneWithApiKey(id: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder("user")
      .select(["user.id", "user.openAiApiKey"])
      .where("user.id = :id", { id })
      .getOne();
  }

  /**
   * Optimized for Anthropic LLM service — selects id + anthropicApiKey only.
   */
  async findOneWithAnthropicKey(id: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder("user")
      .select(["user.id", "user.anthropicApiKey"])
      .where("user.id = :id", { id })
      .getOne();
  }

  /**
   * Fastest query - only checks if user exists.
   * Returns true if user exists, false otherwise.
   */
  async hasUser(id: string): Promise<boolean> {
    const result = await this.userRepository
      .createQueryBuilder("user")
      .select("user.id")
      .where("user.id = :id", { id })
      .getOne();
    return !!result;
  }

  hashEmail(email: string): string {
    return EncryptionHelper.hashEmail(email);
  }

  async findByEmail(email: string): Promise<User | null> {
    const emailHash = EncryptionHelper.hashEmail(email);
    return this.userRepository.findOne({ where: { emailHash } });
  }

  /**
   * Find a user by their hashed password reset token.
   * Used in the reset-password flow to avoid a full table scan.
   */
  async findByPasswordResetToken(hashedToken: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { passwordResetToken: hashedToken },
    });
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async update(id: string, updates: Partial<User>): Promise<User> {
    // If email is being updated, also update emailHash
    if (updates.email && !updates.emailHash) {
      updates.emailHash = EncryptionHelper.hashEmail(updates.email);
    }
    // Use save() instead of update() to trigger @UpdateDateColumn() automatically
    // First ensure we have the entity loaded
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    this.logNeedsReloginFlip(id, updates, user);
    const beforeUpdatedAt = user.updatedAt?.toISOString() || "null";
    // Apply updates to the entity
    Object.assign(user, updates);
    // Save will trigger @UpdateDateColumn() to update updatedAt automatically
    const savedUser = await this.userRepository.save(user);
    const afterUpdatedAt = savedUser.updatedAt?.toISOString() || "null";
    const logMsg = `[UsersService.update] User ${id} updated. updatedAt: ${beforeUpdatedAt} -> ${afterUpdatedAt}`;
    writeDebugLog(logMsg);
    return savedUser;
  }

  async incrementScanProgress(
    id: string,
    amount: number = 1,
  ): Promise<{ scanProgress: number; scanTotal: number; isComplete: boolean }> {
    // Use raw SQL for atomic increment to avoid race conditions
    await this.userRepository.query(
      `UPDATE users 
       SET "scanProgress" = LEAST(COALESCE("scanProgress", 0) + $2, COALESCE("scanTotal", 0))
       WHERE id = $1 AND "scanTotal" IS NOT NULL AND "scanTotal" > 0`,
      [id, amount],
    );

    const user = await this.findOne(id);
    if (!user) {
      return { scanProgress: 0, scanTotal: 0, isComplete: false };
    }

    const scanProgress = user.scanProgress || 0;
    const scanTotal = user.scanTotal || 0;
    const isComplete = scanProgress >= scanTotal && scanTotal > 0;

    // Mark as complete if we've reached the total (only once)
    if (isComplete && !user.hasScannedHistory) {
      await this.userRepository.update(id, { hasScannedHistory: true });
    }

    return { scanProgress, scanTotal, isComplete };
  }

  async acceptConsent(
    userId: string,
    termsAccepted: boolean,
    privacyAccepted: boolean,
  ): Promise<User> {
    const now = new Date();
    const currentTermsVersion = process.env.TERMS_VERSION || "1.0.0";
    const currentPrivacyVersion = process.env.PRIVACY_VERSION || "1.0.0";

    const updates: Partial<User> = {};
    if (termsAccepted) {
      updates.termsAcceptedAt = now;
      updates.termsVersion = currentTermsVersion;
    }
    if (privacyAccepted) {
      updates.privacyAcceptedAt = now;
      updates.privacyVersion = currentPrivacyVersion;
    }

    await this.userRepository.update(userId, updates);
    return this.findOne(userId);
  }

  async getConsentStatus(userId: string): Promise<{
    needsTermsAcceptance: boolean;
    needsPrivacyAcceptance: boolean;
    termsVersion?: string;
    privacyVersion?: string;
    currentTermsVersion: string;
    currentPrivacyVersion: string;
  }> {
    const user = await this.findOne(userId);
    if (!user) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    const currentTermsVersion = process.env.TERMS_VERSION || "1.0.0";
    const currentPrivacyVersion = process.env.PRIVACY_VERSION || "1.0.0";

    const needsTermsAcceptance =
      !user.termsAcceptedAt || user.termsVersion !== currentTermsVersion;
    const needsPrivacyAcceptance =
      !user.privacyAcceptedAt || user.privacyVersion !== currentPrivacyVersion;

    return {
      needsTermsAcceptance,
      needsPrivacyAcceptance,
      termsVersion: user.termsVersion,
      privacyVersion: user.privacyVersion,
      currentTermsVersion,
      currentPrivacyVersion,
    };
  }

  async getOnboardingStatus(userId: string): Promise<{
    hasCompletedOnboarding: boolean;
    needsTermsAcceptance: boolean;
    needsPrivacyAcceptance: boolean;
  }> {
    const user = await this.findOne(userId);
    if (!user) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    const currentTermsVersion = process.env.TERMS_VERSION || "1.0.0";
    const currentPrivacyVersion = process.env.PRIVACY_VERSION || "1.0.0";

    const needsTermsAcceptance =
      !user.termsAcceptedAt || user.termsVersion !== currentTermsVersion;
    const needsPrivacyAcceptance =
      !user.privacyAcceptedAt || user.privacyVersion !== currentPrivacyVersion;

    return {
      hasCompletedOnboarding: user.hasCompletedOnboarding,
      needsTermsAcceptance,
      needsPrivacyAcceptance,
    };
  }

  async completeOnboarding(userId: string): Promise<User> {
    await this.userRepository.update(userId, {
      hasCompletedOnboarding: true,
      hasSeenTour: true,
      hasScannedHistory: true,
    });
    return this.findOne(userId);
  }

  async findOneActivityTimestamp(userId: string): Promise<Date | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: {
        id: true,
        lastActivityAt: true,
      },
    });
    return user?.lastActivityAt ?? null;
  }

  async updateLastActivity(userId: string): Promise<void> {
    await this.userRepository.update(userId, { lastActivityAt: new Date() });
  }

  async isUserActive(
    userId: string,
    thresholdDays = getInactivityThresholdDays(),
  ): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: {
        id: true,
        lastActivityAt: true,
      },
    });
    if (!user?.lastActivityAt) return false;
    const HOURS_PER_DAY = 24;
    const MINUTES_PER_HOUR = 60;
    const SECONDS_PER_MINUTE = 60;
    const MS_PER_SECOND = 1000;
    const msPerDay =
      HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;
    const threshold = new Date(Date.now() - thresholdDays * msPerDay);
    return user.lastActivityAt > threshold;
  }

  async wasUserInactive(
    userId: string,
    thresholdDays = getInactivityThresholdDays(),
  ): Promise<boolean> {
    return !(await this.isUserActive(userId, thresholdDays));
  }

  async findInactiveUserIds(
    thresholdDays = getInactivityThresholdDays(),
  ): Promise<string[]> {
    const HOURS_PER_DAY = 24;
    const MINUTES_PER_HOUR = 60;
    const SECONDS_PER_MINUTE = 60;
    const MS_PER_SECOND = 1000;
    const msPerDay =
      HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;
    const threshold = new Date(Date.now() - thresholdDays * msPerDay);
    const users = await this.userRepository.find({
      where: [
        { lastActivityAt: LessThan(threshold) },
        { lastActivityAt: IsNull() },
      ],
      select: {
        id: true,
      },
    });
    return users.map((user) => user.id);
  }

  /**
   * Returns IDs of non-admin users whose last activity (or account creation if
   * activity was never recorded) falls outside the given retention window.
   * Used by the data-retention cleanup job to find accounts eligible for deletion.
   */
  async findUsersForDeletion(thresholdDays: number): Promise<string[]> {
    const HOURS_PER_DAY = 24;
    const MINUTES_PER_HOUR = 60;
    const SECONDS_PER_MINUTE = 60;
    const MS_PER_SECOND = 1000;
    const msPerDay =
      HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;
    const threshold = new Date(Date.now() - thresholdDays * msPerDay);

    // COALESCE gives new users a grace period based on createdAt when
    // lastActivityAt has not been recorded yet.  Admin accounts are always
    // excluded so infrastructure access cannot be accidentally deleted.
    const rows: { id: string }[] = await this.userRepository.query(
      `SELECT id FROM users
       WHERE COALESCE("lastActivityAt", "createdAt") < $1
         AND "isAdmin" = false`,
      [threshold],
    );

    return rows.map((row) => row.id);
  }

  /**
   * Returns the deleted account record for an email hash, if one exists.
   * Used by AuthService to show a "data deleted" message on login.
   */
  async findDeletedAccountByEmailHash(
    emailHash: string,
  ): Promise<DeletedAccount | null> {
    return this.deletedAccountRepository.findOne({ where: { emailHash } });
  }

  async deleteAccount(
    userId: string,
    reason: DeletionReason = DeletionReason.MANUAL,
  ): Promise<void> {
    const user = await this.findOne(userId);
    if (!user) {
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    const logMsg = `[UsersService.deleteAccount] Deleting account for user ${userId} (reason: ${reason})`;
    writeDebugLog(logMsg);

    if (user.emailHash) {
      await this.deletedAccountRepository.upsert(
        {
          emailHash: user.emailHash,
          passwordHash: user.password ?? null,
          deletionReason: reason,
        },
        { conflictPaths: ["emailHash"] },
      );
    }

    await this.deleteUserRelatedData(userId);
    await this.userRepository.delete(userId);

    const completedMsg = `[UsersService.deleteAccount] Successfully deleted account for user ${userId}`;
    writeDebugLog(completedMsg);
  }

  private async deleteUserRelatedData(userId: string): Promise<void> {
    const userTables = [
      "action_items",
      "suggested_replies",
      "reply_drafts",
      "private_notes",
      "auto_response_logs",
      "auto_response_suppressions",
      "follow_ups",
      "emails",
      "email_threads",
      "scan_emails",
      "contacts",
      "blocked_senders",
      "blocked_keywords",
      "batch_schedules",
      "user_contexts",
      "context_analyses",
      "summarization_rules",
      "priority_overrides",
      "token_usage",
      "google_accounts",
      "office365_accounts",
      "zoho_accounts",
    ];
    for (const tableName of userTables) {
      await this.userRepository.query(
        `DELETE FROM ${tableName} WHERE "userId" = $1`,
        [userId],
      );
    }
  }
}
