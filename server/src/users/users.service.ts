import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { EncryptionHelper } from '../encryption/encryption.helper';

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

  async findOne(id: string): Promise<User> {
    return this.userRepository.findOne({ where: { id } });
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
    const beforeUpdatedAt = user.updatedAt?.toISOString() || 'null';
    // Apply updates to the entity
    Object.assign(user, updates);
    // Save will trigger @UpdateDateColumn() to update updatedAt automatically
    const savedUser = await this.userRepository.save(user);
    const afterUpdatedAt = savedUser.updatedAt?.toISOString() || 'null';
    const logMsg = `[UsersService.update] User ${id} updated. updatedAt: ${beforeUpdatedAt} -> ${afterUpdatedAt}`;
    console.log(logMsg);
    const { writeDebugLog } = require('../auth/auth-logger');
    writeDebugLog(logMsg);
    return savedUser;
  }

  async incrementScanProgress(id: string): Promise<{ scanProgress: number; scanTotal: number; isComplete: boolean }> {
    // Use raw SQL for atomic increment to avoid race conditions
    await this.userRepository.query(
      `UPDATE users 
       SET "scanProgress" = LEAST(COALESCE("scanProgress", 0) + 1, COALESCE("scanTotal", 0))
       WHERE id = $1 AND "scanTotal" IS NOT NULL AND "scanTotal" > 0`,
      [id]
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

  async acceptConsent(userId: string, termsAccepted: boolean, privacyAccepted: boolean): Promise<User> {
    const now = new Date();
    const currentTermsVersion = process.env.TERMS_VERSION || '1.0.0';
    const currentPrivacyVersion = process.env.PRIVACY_VERSION || '1.0.0';

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
      throw new Error('User not found');
    }

    const currentTermsVersion = process.env.TERMS_VERSION || '1.0.0';
    const currentPrivacyVersion = process.env.PRIVACY_VERSION || '1.0.0';

    const needsTermsAcceptance = !user.termsAcceptedAt || user.termsVersion !== currentTermsVersion;
    const needsPrivacyAcceptance = !user.privacyAcceptedAt || user.privacyVersion !== currentPrivacyVersion;

    return {
      needsTermsAcceptance,
      needsPrivacyAcceptance,
      termsVersion: user.termsVersion,
      privacyVersion: user.privacyVersion,
      currentTermsVersion,
      currentPrivacyVersion,
    };
  }
}

