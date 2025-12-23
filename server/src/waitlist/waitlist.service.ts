import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import * as crypto from "crypto";
import { Waitlist } from "../database/entities/waitlist.entity";
import { UsersService } from "../users/users.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { EmailService } from "../email/email.service";

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
  ): Promise<Waitlist> {
    // Auto-approve jeremy@focusbear.io
    const approved = email.toLowerCase() === "jeremy@focusbear.io";

    const entry = this.waitlistRepository.create({
      email,
      emailHash: EncryptionHelper.hashEmail(email),
      firstName,
      reason,
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
          isAdmin: isAdmin || existingUser.isAdmin, // Preserve existing admin status or set if jeremy
        });
      }
    }

    // Send Cliq notification
    await this.sendCliqNotification(email, firstName, reason, approved);

    return saved;
  }

  private async sendCliqNotification(
    email: string,
    firstName: string,
    reason: string,
    approved: boolean,
  ): Promise<void> {
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
        approved,
        timestamp: new Date().toISOString(),
      };

      const body = {
        channel: cliqChannel,
        message: `*New Waitlist Signup*\n\`\`\`${JSON.stringify(waitlistData, null, 2)}\`\`\``,
      };

      await axios.post(cliqUrl, body);
      this.logger.log(`Cliq notification sent for waitlist signup: ${email}`);
    } catch (error: any) {
      // Log error but don't fail the waitlist signup
      this.logger.error(
        `Failed to send Cliq notification: ${error.message}`,
        error.stack,
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

  async approve(id: string): Promise<Waitlist> {
    const entry = await this.findOne(id);
    if (!entry) throw new Error("Waitlist entry not found");

    await this.waitlistRepository.update(id, { approved: true });

    // entry.email is automatically decrypted by the transformer
    const existingUser = await this.usersService.findByEmail(entry.email);

    // Generate password setup token (valid for 7 days)
    const setupToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 7);

    if (!existingUser) {
      // Create user account with setup token (not approved yet - they need to set password first)
      await this.usersService.create({
        email: entry.email,
        name: entry.firstName,
        isApproved: false, // Not approved until password is set
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
        "en", // TODO: Detect language from user preferences or browser settings
      );
      this.logger.log(`Approval email sent to ${entry.email}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send approval email to ${entry.email}: ${error.message}`,
        error.stack,
      );
      // Don't throw - approval is already saved, email can be resent manually if needed
    }

    return this.findOne(id);
  }
}
