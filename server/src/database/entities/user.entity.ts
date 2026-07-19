import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { AutoResponderConfig } from "../../auto-responder/types/auto-responder.types";
import {
  makeGlobalEmailTransformer,
  makeGlobalEncryptedColumnTransformer,
  makeGlobalEncryptedJsonTransformer,
} from "../../encryption/encryption.helper";
import { ActionItem } from "./action-item.entity";
import { AppleMailAccount } from "./apple-mail-account.entity";
import { Email } from "./email.entity";
import { GoogleAccount } from "./google-account.entity";
import { Office365Account } from "./office365-account.entity";
import { PrivateNote } from "./private-note.entity";
import { SummarizationRule } from "./summarization-rule.entity";
import { UserContext } from "./user-context.entity";
import { ZohoAccount } from "./zoho-account.entity";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({
    unique: true,
    comment: "SHA-256 hash for querying (not encrypted)",
  })
  @Index()
  emailHash: string;

  @Column({
    transformer: makeGlobalEmailTransformer("users.email"),
    comment: "Encrypted actual email",
  })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column({
    nullable: true,
    comment: "Token for setting up password after waitlist approval",
  })
  passwordSetupToken: string;

  @Column({
    nullable: true,
    comment: "Token expiration (7 days)",
  })
  passwordSetupTokenExpiresAt: Date;

  @Column({
    nullable: true,
    comment: "Hashed token for password reset (1 hour expiry)",
  })
  passwordResetToken: string;

  @Column({
    nullable: true,
    comment: "Password reset token expiration (1 hour)",
  })
  passwordResetExpires: Date;

  @Column({ nullable: true })
  googleId: string;

  @Column({
    nullable: true,
    transformer: makeGlobalEncryptedColumnTransformer("users.name"),
  })
  name: string;

  @Column({
    nullable: true,
    transformer: makeGlobalEncryptedColumnTransformer("users.displayName"),
    comment:
      "User's preferred display name for email signatures (encrypted). Guessed from email during signup.",
  })
  displayName: string;

  @Column({
    nullable: true,
    transformer: makeGlobalEncryptedColumnTransformer("users.jobTitle"),
    comment: "User's job title for context in email replies (encrypted).",
  })
  jobTitle: string;

  @Column({
    nullable: true,
    transformer: makeGlobalEncryptedColumnTransformer(
      "users.googleCalendarAccessToken",
    ),
  })
  googleCalendarAccessToken: string;

  @Column({
    nullable: true,
    transformer: makeGlobalEncryptedColumnTransformer(
      "users.googleCalendarRefreshToken",
    ),
  })
  googleCalendarRefreshToken: string;

  @Column({
    nullable: true,
    transformer: makeGlobalEncryptedColumnTransformer(
      "users.calendarBookingUrl",
    ),
    comment: "User's calendar booking link for scheduling replies (encrypted)",
  })
  calendarBookingUrl: string;

  @Column({
    default: false,
    comment: "Added field to track auth errors",
  })
  needsRelogin: boolean;

  @Column({
    type: "text",
    nullable: true,
    comment:
      "Diagnostic: machine code for the most recent forced logout / needsRelogin (e.g. gmail_invalid_token). Not PII.",
  })
  lastLogoutReason: string | null;

  @Column({
    type: "timestamptz",
    nullable: true,
    comment:
      "Diagnostic: when the most recent forced logout / needsRelogin was recorded.",
  })
  lastLogoutAt: Date | null;

  @Column({
    default: false,
    comment: "Track if user has completed onboarding tour",
  })
  hasSeenTour: boolean;

  @Column({
    default: false,
    comment: "Track if user has allowed historical email scan",
  })
  hasScannedHistory: boolean;

  @Column({
    default: false,
    comment: "Track if user has completed the onboarding wizard",
  })
  hasCompletedOnboarding: boolean;

  @Column({
    nullable: true,
    comment: "Current scan progress (0-100)",
  })
  scanProgress: number;

  @Column({
    nullable: true,
    comment: "Total emails to scan",
  })
  scanTotal: number;

  @Column({
    default: false,
    comment: "Admin role",
  })
  isAdmin: boolean;

  @Column({
    default: false,
    comment: "Approved from waitlist",
  })
  isApproved: boolean;

  @Column({
    nullable: true,
    comment: "When user accepted terms of use",
  })
  termsAcceptedAt: Date;

  @Column({
    nullable: true,
    comment: "When user accepted privacy policy",
  })
  privacyAcceptedAt: Date;

  @Column({
    nullable: true,
    comment: "Version of terms accepted",
  })
  termsVersion: string;

  @Column({
    nullable: true,
    comment: "Version of privacy policy accepted",
  })
  privacyVersion: string;

  @Column({
    nullable: true,
    transformer: makeGlobalEncryptedColumnTransformer("users.openAiApiKey"),
    comment: "OpenAI API key (encrypted) - allows users to use their own key",
  })
  openAiApiKey: string;

  @Column({
    nullable: true,
    transformer: makeGlobalEncryptedColumnTransformer("users.anthropicApiKey"),
    comment:
      "Anthropic API key (encrypted) - allows users to use their own key (sk-ant-api03-* or sk-ant-oat-* OAuth token)",
  })
  anthropicApiKey: string;

  @Column({
    nullable: true,
    transformer: makeGlobalEncryptedColumnTransformer("users.githubToken"),
    comment: "GitHub fine-grained PAT (encrypted) - for GitHub integration",
  })
  githubToken: string;

  @Column({
    type: "text",
    nullable: true,
    comment:
      "Connected GitHub account's login (e.g. 'jeremynagel'). Used to match " +
      "the user against PR authors / requested reviewers when surfacing " +
      "GitHub signals on the inbox card. Not encrypted because it isn't PII " +
      "in the usual sense — a public GitHub handle, populated on OAuth callback.",
  })
  githubUsername: string | null;

  @Column({
    nullable: true,
    comment: "RevenueCat customer ID",
  })
  revenueCatUserId: string;

  @Column({
    nullable: true,
    comment: "active, trial, expired, cancelled",
  })
  subscriptionStatus: string;

  @Column({
    nullable: true,
    comment: "When subscription expires",
  })
  subscriptionExpiresAt: Date;

  @Column({
    nullable: true,
    comment: "When 7-day trial started",
  })
  trialStartedAt: Date;

  @Column({
    nullable: true,
    comment: "When user's emails were last synced from email provider",
  })
  lastEmailSyncAt: Date | null;

  @Column({
    nullable: true,
    comment:
      "Upper bound of the sent-mail window already scanned for writing-style examples; the learning cron only fetches sent mail after this, so each email is LLM-validated at most once",
  })
  writingStyleCheckedUpTo: Date | null;

  @Column({
    default: false,
    comment:
      "True when the initial sync skipped older mail (500-email cap / 7-day window). Drives the client 'old emails not synced' banner.",
  })
  syncWindowLimited: boolean;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeGlobalEncryptedJsonTransformer("users.toneSettings"),
    comment: "e.g., { rules: ['Be concise', 'Use non-violent communication'] }",
  })
  toneSettings: { rules: string[] };

  @Column({
    type: "text",
    nullable: true,
    transformer: makeGlobalEncryptedJsonTransformer(
      "users.autoResponderSettings",
    ),
    comment: "Auto-responder configuration settings",
  })
  autoResponderSettings: AutoResponderConfig | null;

  @Column({
    nullable: true,
    default: "UTC",
    comment: "User's timezone (e.g., 'America/New_York', 'Europe/London')",
  })
  timezone: string;

  @Column({
    nullable: true,
    transformer: makeGlobalEncryptedColumnTransformer("users.emailSignature"),
    comment:
      "User's email signature (encrypted). Default: 'Sent from BearlyMail (anti inbox overwhelm system)'",
  })
  emailSignature: string;

  @Column({
    nullable: true,
    comment: "When user last accessed BearlyMail (login, API call, etc.)",
  })
  @Index()
  lastActivityAt: Date | null;

  @Column({
    nullable: true,
    comment:
      "When the user last changed their password. JWTs issued before this timestamp are considered invalidated (OWASP ASVS req 3.3.1 / 3.3.2).",
  })
  passwordChangedAt: Date | null;

  @Column({
    type: "text",
    nullable: true,
    comment:
      "KMS-encrypted AES-256 data key (base64). Null when KMS envelope encryption is disabled.",
  })
  encryptedDataKey: string | null;

  @Column({
    type: "timestamptz",
    nullable: true,
    comment:
      "Timestamp when this user's encrypted data was fully re-encrypted under the per-user KMS data key. Null until a re-encryption job has completed for the user.",
  })
  dataReencryptedAt: Date | null;

  @Column({
    nullable: true,
    transformer: makeGlobalEncryptedColumnTransformer("users.totpSecret"),
    comment:
      "TOTP secret for MFA (encrypted). Set during setup, null until MFA is configured.",
  })
  totpSecret: string | null;

  @Column({
    default: false,
    comment:
      "Whether TOTP-based MFA is active for this account. Required for admin accounts (SAQ Q35, GAP-2).",
  })
  totpEnabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => UserContext, (context) => context.user)
  contexts: UserContext[];

  @OneToMany(() => PrivateNote, (note) => note.user)
  notes: PrivateNote[];

  @OneToMany(() => Email, (email) => email.user)
  emails: Email[];

  @OneToMany(() => SummarizationRule, (rule) => rule.user)
  summarizationRules: SummarizationRule[];

  @OneToMany(() => ActionItem, (item) => item.user)
  actionItems: ActionItem[];

  @OneToMany(() => GoogleAccount, (account) => account.user)
  googleAccounts: GoogleAccount[];

  @OneToMany(() => Office365Account, (account) => account.user)
  office365Accounts: Office365Account[];

  @OneToMany(() => ZohoAccount, (account) => account.user)
  zohoAccounts: ZohoAccount[];

  @OneToMany(() => AppleMailAccount, (account) => account.user)
  appleMailAccounts: AppleMailAccount[];
}
