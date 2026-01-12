import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from "typeorm";
import { UserContext } from "./user-context.entity";
import { PrivateNote } from "./private-note.entity";
import { Email } from "./email.entity";
import { SummarizationRule } from "./summarization-rule.entity";
import { ActionItem } from "./action-item.entity";
import { GoogleAccount } from "./google-account.entity";
import { Office365Account } from "./office365-account.entity";
import { ZohoAccount } from "./zoho-account.entity";
import {
  encryptedColumnTransformer,
  emailTransformer,
  encryptedJsonTransformer,
} from "../../encryption/encryption.helper";

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
    transformer: emailTransformer,
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

  @Column({ nullable: true })
  googleId: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  name: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  googleCalendarAccessToken: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  googleCalendarRefreshToken: string;

  @Column({
    default: false,
    comment: "Added field to track auth errors",
  })
  needsRelogin: boolean;

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
    transformer: encryptedColumnTransformer,
    comment: "OpenAI API key (encrypted) - allows users to use their own key",
  })
  openAiApiKey: string;

  @Column({
    nullable: true,
    transformer: encryptedColumnTransformer,
    comment: "GitHub fine-grained PAT (encrypted) - for GitHub integration",
  })
  githubToken: string;

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
    type: "text",
    nullable: true,
    transformer: encryptedJsonTransformer,
    comment: "e.g., { rules: ['Be concise', 'Use non-violent communication'] }",
  })
  toneSettings: { rules: string[] };

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
}
