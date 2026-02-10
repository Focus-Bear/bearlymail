import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../database/entities/user.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { writeDebugLog } from "../auth/auth-logger";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

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
  async findOneForAuth(id: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder("user")
      .select(["user.id", "user.email", "user.isAdmin", "user.isApproved"])
      .where("user.id = :id", { id })
      .getOne();
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
        "user.updatedAt",
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

  async findByEmail(email: string): Promise<User | null> {
    const emailHash = EncryptionHelper.hashEmail(email);
    return this.userRepository.findOne({ where: { emailHash } });
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
    const beforeUpdatedAt = user.updatedAt?.toISOString() || "null";
    // Apply updates to the entity
    Object.assign(user, updates);
    // Save will trigger @UpdateDateColumn() to update updatedAt automatically
    const savedUser = await this.userRepository.save(user);
    const afterUpdatedAt = savedUser.updatedAt?.toISOString() || "null";
    const logMsg = `[UsersService.update] User ${id} updated. updatedAt: ${beforeUpdatedAt} -> ${afterUpdatedAt}`;
    // eslint-disable-next-line no-console
    console.log(logMsg);
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
      throw new Error("User not found");
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
      throw new Error("User not found");
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

  async deleteAccount(userId: string): Promise<void> {
    const user = await this.findOne(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const logMsg = `[UsersService.deleteAccount] Deleting account for user ${userId}`;
    // eslint-disable-next-line no-console
    console.log(logMsg);
    writeDebugLog(logMsg);

    // Delete all related data in the correct order (respecting foreign key constraints)
    // Using raw queries since we only have access to the User repository

    // Delete action items
    await this.userRepository.query(
      `DELETE FROM action_items WHERE "userId" = $1`,
      [userId],
    );

    // Delete suggested replies
    await this.userRepository.query(
      `DELETE FROM suggested_replies WHERE "userId" = $1`,
      [userId],
    );

    // Delete reply drafts
    await this.userRepository.query(
      `DELETE FROM reply_drafts WHERE "userId" = $1`,
      [userId],
    );

    // Delete private notes
    await this.userRepository.query(
      `DELETE FROM private_notes WHERE "userId" = $1`,
      [userId],
    );

    // Delete auto response logs
    await this.userRepository.query(
      `DELETE FROM auto_response_logs WHERE "userId" = $1`,
      [userId],
    );

    // Delete auto response suppressions
    await this.userRepository.query(
      `DELETE FROM auto_response_suppressions WHERE "userId" = $1`,
      [userId],
    );

    // Delete follow-ups
    await this.userRepository.query(
      `DELETE FROM follow_ups WHERE "userId" = $1`,
      [userId],
    );

    // Delete emails
    await this.userRepository.query(`DELETE FROM emails WHERE "userId" = $1`, [
      userId,
    ]);

    // Delete email threads
    await this.userRepository.query(
      `DELETE FROM email_threads WHERE "userId" = $1`,
      [userId],
    );

    // Delete scan emails
    await this.userRepository.query(
      `DELETE FROM scan_emails WHERE "userId" = $1`,
      [userId],
    );

    // Delete contacts
    await this.userRepository.query(
      `DELETE FROM contacts WHERE "userId" = $1`,
      [userId],
    );

    // Delete blocked senders
    await this.userRepository.query(
      `DELETE FROM blocked_senders WHERE "userId" = $1`,
      [userId],
    );

    // Delete blocked keywords
    await this.userRepository.query(
      `DELETE FROM blocked_keywords WHERE "userId" = $1`,
      [userId],
    );

    // Delete batch schedules
    await this.userRepository.query(
      `DELETE FROM batch_schedules WHERE "userId" = $1`,
      [userId],
    );

    // Delete user contexts
    await this.userRepository.query(
      `DELETE FROM user_contexts WHERE "userId" = $1`,
      [userId],
    );

    // Delete context analyses
    await this.userRepository.query(
      `DELETE FROM context_analyses WHERE "userId" = $1`,
      [userId],
    );

    // Delete summarization rules
    await this.userRepository.query(
      `DELETE FROM summarization_rules WHERE "userId" = $1`,
      [userId],
    );

    // Delete priority overrides
    await this.userRepository.query(
      `DELETE FROM priority_overrides WHERE "userId" = $1`,
      [userId],
    );

    // Delete token usage (nullable userId, so use IS NOT DISTINCT FROM)
    await this.userRepository.query(
      `DELETE FROM token_usage WHERE "userId" = $1`,
      [userId],
    );

    // Delete Google accounts
    await this.userRepository.query(
      `DELETE FROM google_accounts WHERE "userId" = $1`,
      [userId],
    );

    // Delete Office365 accounts
    await this.userRepository.query(
      `DELETE FROM office365_accounts WHERE "userId" = $1`,
      [userId],
    );

    // Delete Zoho accounts
    await this.userRepository.query(
      `DELETE FROM zoho_accounts WHERE "userId" = $1`,
      [userId],
    );

    // Finally, delete the user
    await this.userRepository.delete(userId);

    const completedMsg = `[UsersService.deleteAccount] Successfully deleted account for user ${userId}`;
    // eslint-disable-next-line no-console
    console.log(completedMsg);
    writeDebugLog(completedMsg);
  }
}
