import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import axios from "axios";
import * as crypto from "crypto";
import { Repository } from "typeorm";

import { TOKEN_CONSTANTS } from "../constants/service-constants";
import { Waitlist } from "../database/entities/waitlist.entity";
import { EmailService } from "../email/email.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { getErrorMessage, isError } from "../types/common";
import { UsersService } from "../users/users.service";

export const WAITLIST_SIGNUP_STATUS = {
  CREATED: "created",
  ALREADY_ON_WAITLIST: "already_on_waitlist",
} as const;

export type WaitlistSignupStatus =
  (typeof WAITLIST_SIGNUP_STATUS)[keyof typeof WAITLIST_SIGNUP_STATUS];

export interface WaitlistSignupResult {
  status: WaitlistSignupStatus;
  entry?: Waitlist;
}

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    @InjectRepository(Waitlist)
    private waitlistRepository: Repository<Waitlist>,
    private usersService: UsersService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  async create(
    email: string,
    firstName: string,
    reason: string,
    emailSystem?: string,
    emailSystemOther?: string,
  ): Promise<WaitlistSignupResult> {
    const existing = await this.findByEmail(email);
    if (existing) {
      this.logger.log(
        `Waitlist signup skipped: ${email} is already on the waitlist`,
      );
      return { status: WAITLIST_SIGNUP_STATUS.ALREADY_ON_WAITLIST };
    }

    // Auto-approve jeremy@focusbear.io
    const approved = email.toLowerCase() === "jeremy@focusbear.io";

    const entry = this.waitlistRepository.create({
      email,
      emailHash: EncryptionHelper.hashEmail(email),
      firstName,
      reason,
      emailSystem,
      emailSystemOther,
      approved,
    });

    const saved = await this.waitlistRepository.save(entry);

    // If auto-approved, create user account immediately (if it doesn't exist)
    if (approved) {
      const isAdmin = email.toLowerCase() === "jeremy@focusbear.io";
      const existingUser = await this.usersService.findByEmail(email);
      if (!existingUser) {
        await this.usersService.create({
          email,
          name: firstName,
          isApproved: true,
          isAdmin,
        });
      } else {
        // Update existing user to approved
        await this.usersService.update(existingUser.id, {
          isApproved: true,
          // Preserve existing admin status or set if jeremy
          isAdmin: isAdmin || existingUser.isAdmin,
        });
      }
    }

    // Send Cliq notification
    await this.sendCliqNotification({
      email,
      firstName,
      reason,
      approved,
      emailSystem,
      emailSystemOther,
    });

    // Auto-approved signups get an account immediately, so the "we'll email
    // you when a spot opens" confirmation would be misleading for them.
    if (!approved) {
      await this.sendConfirmationEmail(email, firstName);
    }

    return { status: WAITLIST_SIGNUP_STATUS.CREATED, entry: saved };
  }

  /** Email failures must not fail the signup — log and continue. */
  private async sendConfirmationEmail(
    email: string,
    firstName: string,
  ): Promise<void> {
    try {
      await this.emailService.sendWaitlistConfirmationEmail(
        email,
        firstName,
        "en",
      );
      this.logger.log(`Waitlist confirmation email sent to ${email}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to send waitlist confirmation email to ${email}: ${getErrorMessage(error)}`,
        isError(error) ? error.stack : undefined,
      );
    }
  }

  private async sendCliqNotification(options: {
    email: string;
    firstName: string;
    reason: string;
    approved: boolean;
    emailSystem?: string;
    emailSystemOther?: string;
  }): Promise<void> {
    const {
      email,
      firstName,
      reason,
      approved,
      emailSystem,
      emailSystemOther,
    } = options;
    try {
      const cliqWebhookUrl = this.configService.get<string>(
        "ZOHO_CLIQ_BACKEND_BOT_WEBHOOK",
      );
      const cliqApiKey = this.configService.get<string>("ZOHO_CLIQ_API_KEY");
      const cliqChannel = this.configService.get<string>(
        "ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL",
      );

      if (!cliqWebhookUrl || !cliqApiKey || !cliqChannel) {
        this.logger.warn("Cliq configuration missing, skipping notification");
        return;
      }

      const cliqUrl = `${cliqWebhookUrl}?zapikey=${cliqApiKey}`;

      const waitlistData = {
        email,
        firstName,
        reason,
        emailSystem,
        emailSystemOther,
        approved,
        timestamp: new Date().toISOString(),
      };

      const body = {
        channel: cliqChannel,
        message: `*New Waitlist Signup*\n\`\`\`${JSON.stringify(waitlistData, null, 2)}\`\`\``,
      };

      await axios.post(cliqUrl, body);
      this.logger.log(`Cliq notification sent for waitlist signup: ${email}`);
    } catch (error: unknown) {
      // Log error but don't fail the waitlist signup
      this.logger.error(
        `Failed to send Cliq notification: ${getErrorMessage(error)}`,
        isError(error) ? error.stack : undefined,
      );
    }
  }

  async findAll(): Promise<Waitlist[]> {
    return this.waitlistRepository.find({ order: { createdAt: "DESC" } });
  }

  async findOne(id: string): Promise<Waitlist> {
    return this.waitlistRepository.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<Waitlist | null> {
    const emailHash = EncryptionHelper.hashEmail(email);
    return this.waitlistRepository.findOne({ where: { emailHash } });
  }

  async decline(id: string): Promise<void> {
    const entry = await this.findOne(id);
    if (!entry) throw new Error("Waitlist entry not found");

    await this.waitlistRepository.delete(id);
  }

  async approve(id: string): Promise<Waitlist> {
    const entry = await this.findOne(id);
    if (!entry) throw new Error("Waitlist entry not found");

    await this.waitlistRepository.update(id, { approved: true });

    // entry.email is automatically decrypted by the transformer
    const existingUser = await this.usersService.findByEmail(entry.email);

    // Generate password setup token (valid for 7 days)
    const setupToken = crypto
      .randomBytes(TOKEN_CONSTANTS.TOKEN_BYTES)
      .toString("hex");
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(
      tokenExpiresAt.getDate() + TOKEN_CONSTANTS.PASSWORD_SETUP_TOKEN_DAYS,
    );

    if (!existingUser) {
      // Create user account with setup token (not approved yet - they need to set password first)
      await this.usersService.create({
        email: entry.email,
        name: entry.firstName,
        // Not approved until password is set
        isApproved: false,
        isAdmin: entry.email.toLowerCase() === "jeremy@focusbear.io",
        passwordSetupToken: setupToken,
        passwordSetupTokenExpiresAt: tokenExpiresAt,
      });
    } else {
      // Update existing user with setup token
      await this.usersService.update(existingUser.id, {
        passwordSetupToken: setupToken,
        passwordSetupTokenExpiresAt: tokenExpiresAt,
        // Don't set isApproved to true yet - they need to set password first
      });
    }

    // Send approval email with setup link
    // Default to English, but could be enhanced to detect from user preferences or browser
    try {
      await this.emailService.sendWaitlistApprovalEmail(
        entry.email,
        entry.firstName,
        setupToken,
        // TODO: Detect language from user preferences or browser settings
        "en",
      );
      this.logger.log(`Approval email sent to ${entry.email}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to send approval email to ${entry.email}: ${getErrorMessage(error)}`,
        isError(error) ? error.stack : undefined,
      );
      // Don't throw - approval is already saved, email can be resent manually if needed
    }

    return this.findOne(id);
  }
}
