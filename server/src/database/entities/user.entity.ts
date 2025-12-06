import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { UserContext } from './user-context.entity';
import { PrivateNote } from './private-note.entity';
import { Email } from './email.entity';
import { SummarizationRule } from './summarization-rule.entity';
import { ActionItem } from './action-item.entity';
import { encryptedColumnTransformer, emailTransformer, encryptedJsonTransformer } from '../../encryption/encryption.helper';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  emailHash: string; // SHA-256 hash for querying (not encrypted)

  @Column({ transformer: emailTransformer })
  email: string; // Encrypted actual email

  @Column({ nullable: true })
  password: string;

  @Column({ nullable: true })
  googleId: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  googleCalendarAccessToken: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  googleCalendarRefreshToken: string;

  @Column({ default: 6 })
  batchDeliveryHours: number;

  @Column({ default: false })
  needsRelogin: boolean; // Added field to track auth errors

  @Column({ default: false })
  hasSeenTour: boolean; // Track if user has completed onboarding tour

  @Column({ default: false })
  hasScannedHistory: boolean; // Track if user has allowed historical email scan

  @Column({ nullable: true })
  scanProgress: number; // Current scan progress (0-100)

  @Column({ nullable: true })
  scanTotal: number; // Total emails to scan

  @Column({ default: false })
  isAdmin: boolean; // Admin role

  @Column({ default: false })
  isApproved: boolean; // Approved from waitlist

  // Privacy & Terms consent tracking
  @Column({ nullable: true })
  termsAcceptedAt: Date; // When user accepted terms of use
  
  @Column({ nullable: true })
  privacyAcceptedAt: Date; // When user accepted privacy policy
  
  @Column({ nullable: true })
  termsVersion: string; // Version of terms accepted
  
  @Column({ nullable: true })
  privacyVersion: string; // Version of privacy policy accepted

  // OpenAI API key (encrypted) - allows users to use their own key
  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  openAiApiKey: string;

  // RevenueCat subscription fields
  @Column({ nullable: true })
  revenueCatUserId: string; // RevenueCat customer ID
  
  @Column({ nullable: true })
  subscriptionStatus: string; // active, trial, expired, cancelled
  
  @Column({ nullable: true })
  subscriptionExpiresAt: Date; // When subscription expires
  
  @Column({ nullable: true })
  trialStartedAt: Date; // When 7-day trial started

  @Column('text', { nullable: true, transformer: encryptedJsonTransformer })
  toneSettings: { rules: string[] }; // e.g., { rules: ['Be concise', 'Use non-violent communication'] }

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
}
