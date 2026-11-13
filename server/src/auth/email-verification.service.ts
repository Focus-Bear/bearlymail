import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { TOKEN_BYTES, TOKEN_EXPIRY_MS } from "../constants/auth-constants";
import { EMAIL_VERIFICATION } from "../constants/auth-security.constants";
import { MILLISECONDS } from "../constants/time-constants";
import { AppleMailAccount } from "../database/entities/apple-mail-account.entity";
import { GoogleAccount } from "../database/entities/google-account.entity";
import { ImapAccount } from "../database/entities/imap-account.entity";
import { Office365Account } from "../database/entities/office365-account.entity";
import { PersonalAccessToken } from "../database/entities/personal-access-token.entity";
import { User } from "../database/entities/user.entity";
import { ZohoAccount } from "../database/entities/zoho-account.entity";
import { EmailService } from "../email/email.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { revokeAllAccessTokens } from "../personal-access-tokens/revoke-all-access-tokens";
import { UsersService } from "../users/users.service";
import { isDevelopment } from "../utils/logs-dir";
import { EmailNotVerifiedException } from "./exceptions/email-not-verified.exception";
import { generateEmailedToken, hashEmailedToken } from "./token-hash.util";

/** A fresh link isn't re-sent for this long, however often resend is hit. */
const RESEND_COOLDOWN_MS = MILLISECONDS.MINUTE;

type MailboxRepository = Repository<{ userId: string; email: string }>;

/** Columns that record a proven address and retire any outstanding link. */
export function emailVerifiedFields(
  now: Date,
): Pick<
  User,
  | "emailVerifiedAt"
  | "emailVerificationTokenHash"
  | "emailVerificationTokenExpiresAt"
> {
  return {
    emailVerifiedAt: now,
    emailVerificationTokenHash: null,
    emailVerificationTokenExpiresAt: null,
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function frontendUrl(): string {
  return process.env.FRONTEND_URL || "http://localhost:3000";
}

function normaliseAddress(address: string | null | undefined): string {
  return (address ?? "").trim().toLowerCase();
}

/**
 * Proves that whoever holds an account owns its email address, through the
 * links we email (verification, password reset) and sign-in providers that
 * vouch for the address.
 *
 * A password sign-up starts unverified and gets an emailed link; password
 * sign-in is refused until it is followed. Flows that already prove
 * ownership (emailed setup/reset links, a sign-in provider vouching for the
 * address) mark the user verified directly, via `emailVerifiedFields`.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly mailboxRepositories: MailboxRepository[];

  constructor(
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly userEncryptionService: UserEncryptionService,
    @InjectRepository(GoogleAccount)
    googleAccounts: Repository<GoogleAccount>,
    @InjectRepository(Office365Account)
    office365Accounts: Repository<Office365Account>,
    @InjectRepository(ZohoAccount)
    zohoAccounts: Repository<ZohoAccount>,
    @InjectRepository(ImapAccount)
    imapAccounts: Repository<ImapAccount>,
    @InjectRepository(AppleMailAccount)
    appleMailAccounts: Repository<AppleMailAccount>,
    @InjectRepository(PersonalAccessToken)
    private readonly accessTokenRepository: Repository<PersonalAccessToken>,
  ) {
    this.mailboxRepositories = [
      googleAccounts,
      office365Accounts,
      zohoAccounts,
      imapAccounts,
      appleMailAccounts,
    ] as unknown as MailboxRepository[];
  }

  /**
   * Issues a new 24-hour verification link for the user and emails it. A
   * delivery failure is logged, not thrown: the user can ask for another.
   */
  async sendVerification(user: Pick<User, "id" | "email" | "name">) {
    const { token, tokenHash } = generateEmailedToken(
      EMAIL_VERIFICATION.TOKEN_BYTES,
    );
    await this.usersService.update(user.id, {
      emailVerificationTokenHash: tokenHash,
      emailVerificationTokenExpiresAt: new Date(
        Date.now() + EMAIL_VERIFICATION.TOKEN_TTL_MS,
      ),
    });
    const verifyUrl = `${frontendUrl()}${EMAIL_VERIFICATION.CLIENT_PATH}?token=${token}`;
    try {
      await this.emailService.sendEmailVerificationEmail(
        user.email,
        user.name || user.email,
        verifyUrl,
      );
      this.logger.log(
        `[VERIFY_EMAIL] Verification email sent to user ${user.id}`,
      );
    } catch (error) {
      this.logger.error(
        `[VERIFY_EMAIL] Could not send the verification email for user ${user.id}: ${describeError(error)}`,
      );
      // Local development usually has no mail transport configured.
      if (isDevelopment) {
        this.logger.warn(
          `[VERIFY_EMAIL] Dev-only verification link: ${verifyUrl}`,
        );
      }
    }
  }

  /**
   * Sends a verification link when the account exists, has a password and
   * isn't verified yet. Silent otherwise, so the response never reveals
   * whether an address is registered.
   */
  async resendVerification(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user || user.emailVerifiedAt || !user.password) return;
    if (this.issuedRecently(user)) return;
    await this.sendVerification(user);
  }

  /** Sends a link at a refused password sign-in unless a recent one is still outstanding. */
  async sendVerificationIfNoneOutstanding(user: User): Promise<void> {
    if (
      user.emailVerificationTokenExpiresAt &&
      user.emailVerificationTokenExpiresAt > new Date()
    ) {
      return;
    }
    await this.sendVerification(user);
  }

  /**
   * Redeems a verification link. Doesn't sign the user in: they still need
   * the password they chose, so following a link someone else requested
   * hands them nothing.
   */
  async verifyEmail(token: string): Promise<void> {
    const user = token
      ? await this.usersService.findByEmailVerificationTokenHash(
          hashEmailedToken(token),
        )
      : null;
    if (!user) {
      throw new BadRequestException(
        "This verification link is invalid or has expired. Request a new one from the sign-in page.",
      );
    }
    await this.usersService.update(user.id, emailVerifiedFields(new Date()));
    this.logger.log(`[VERIFY_EMAIL] User ${user.id} verified their email`);
  }

  /**
   * Emails a short-lived password-reset link. Only the token's hash is
   * stored; a delivery failure is logged, never surfaced to the requester.
   */
  async sendPasswordResetLink(user: User): Promise<void> {
    const { token, tokenHash } = generateEmailedToken(TOKEN_BYTES);
    await this.usersService.update(user.id, {
      passwordSetupTokenHash: tokenHash,
      passwordSetupTokenExpiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS),
    });
    try {
      await this.emailService.sendPasswordResetEmail(
        user.email,
        user.name || user.email,
        `${frontendUrl()}/reset-password?token=${token}`,
      );
      this.logger.log(`[FORGOT_PASSWORD] Reset email sent for user ${user.id}`);
    } catch (error) {
      this.logger.error(
        `[FORGOT_PASSWORD] Could not send the reset email for user ${user.id}: ${describeError(error)}`,
      );
    }
  }

  /**
   * Refuses password sign-in until the address is proven (call only after
   * the password matched). Accounts from before verification existed also
   * count as proven when one of their connected mailboxes has the account's
   * address. Otherwise a link is emailed and EmailNotVerifiedException thrown.
   */
  async assertVerifiedForPasswordSignIn(user: User): Promise<void> {
    if (user.emailVerifiedAt) return;
    if (await this.ownsAddressSafely(user)) {
      await this.usersService.update(user.id, emailVerifiedFields(new Date()));
      return;
    }
    await this.sendVerificationIfNoneOutstanding(user);
    throw new EmailNotVerifiedException();
  }

  /**
   * A sign-in provider just vouched that the person signing in owns this
   * address. On an account that never proved ownership, any password was set
   * by someone who didn't, so it is removed — setting passwordChangedAt ends
   * that person's sessions, and their MCP tokens are revoked — before the
   * provider's user is signed in. A legacy account whose own connected
   * mailbox proves the address keeps its password.
   */
  async claimForProviderSignIn(user: User): Promise<User> {
    if (user.emailVerifiedAt) return user;
    const now = new Date();
    const dropPassword =
      !!user.password && !(await this.ownsAddressSafely(user));
    await this.usersService.update(user.id, {
      ...emailVerifiedFields(now),
      ...(dropPassword
        ? {
            password: "",
            passwordChangedAt: now,
            failedLoginAttempts: 0,
            loginLockedUntil: null,
          }
        : {}),
    });
    if (dropPassword) {
      await revokeAllAccessTokens(this.accessTokenRepository, user.id, now);
      this.logger.warn(
        `[LOGIN] Removed the password from unverified user ${user.id} after a provider-verified sign-in`,
      );
    }
    return this.usersService.findOne(user.id);
  }

  /** ownsAddressViaConnectedMailbox, with a failed check counting as no. */
  private async ownsAddressSafely(user: User): Promise<boolean> {
    try {
      return await this.ownsAddressViaConnectedMailbox(user);
    } catch (error) {
      this.logger.error(
        `[LOGIN] Connected-mailbox check failed for user ${user.id}: ${describeError(error)}`,
      );
      return false;
    }
  }

  /**
   * True when one of the user's connected mailboxes (each of which required
   * signing in to that mailbox) has the account's own address. Mailbox
   * addresses are encrypted per user, so this runs under the user's key.
   */
  async ownsAddressViaConnectedMailbox(user: User): Promise<boolean> {
    const address = normaliseAddress(user.email);
    if (!address) return false;
    return this.userEncryptionService.withUserKey(user.id, async () => {
      for (const repository of this.mailboxRepositories) {
        const accounts = await repository.find({
          where: { userId: user.id },
          select: { email: true },
        });
        if (
          accounts.some(
            (account) => normaliseAddress(account.email) === address,
          )
        ) {
          return true;
        }
      }
      return false;
    });
  }

  private issuedRecently(user: User): boolean {
    const expiresAt = user.emailVerificationTokenExpiresAt;
    if (!expiresAt) return false;
    const issuedAt = expiresAt.getTime() - EMAIL_VERIFICATION.TOKEN_TTL_MS;
    return Date.now() - issuedAt < RESEND_COOLDOWN_MS;
  }
}
