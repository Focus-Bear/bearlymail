import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from "typeorm";
import { User } from "./user.entity";
import { encryptedColumnTransformer } from "../../encryption/encryption.helper";
import { ContactNote } from "./contact-note.entity";
import { ContactCustomFieldValue } from "./contact-custom-field-value.entity";
import { Deal } from "./deal.entity";

export const DEFAULT_CONTACT_TYPES = [
  "lead",
  "customer",
  "team_member",
  "advisor",
  "stranger",
  "bot",
  "partner",
  "spammer",
] as const;

export type DefaultContactType = (typeof DEFAULT_CONTACT_TYPES)[number];

/**
 * Contact entity with searchable encryption using blind indexing.
 *
 * Encryption Strategy:
 * - Sensitive fields (name, email, phone, etc.) are AES-256-GCM encrypted
 * - Search is enabled via blind indexes (SHA-256 hashes of normalized tokens)
 * - emailHash: exact email matching (lowercase, trimmed)
 * - searchTokens: JSON array of hashed trigrams/tokens for fuzzy search
 *
 * This allows searching contacts without decrypting all data:
 * - Hash the search query → match against searchTokens or emailHash
 * - Only decrypt the matching contacts for display
 */
@Entity("contacts")
@Index(["userId", "emailHash"])
@Index(["userId", "provider", "providerId"], { unique: true })
@Index(["userId", "contactType"])
export class Contact {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ default: "manual", comment: "'gmail', 'outlook', 'manual', etc." })
  provider: string;

  @Column({
    nullable: true,
    comment: "Provider-specific ID (e.g., Google People resourceName)",
  })
  providerId: string;

  @Column({ transformer: encryptedColumnTransformer })
  email: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  name: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  firstName: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  lastName: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  phone: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  company: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  jobTitle: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  photoUrl: string;

  @Column()
  @Index()
  emailHash: string;

  @Column("text", { nullable: true, comment: "JSON array of hashed tokens" })
  searchTokens: string;

  @Column({ default: false })
  isFavorite: boolean;

  @Column({ nullable: true })
  lastContactedAt: Date;

  @Column({ default: 0, comment: "How often user emails this contact" })
  contactFrequency: number;

  @Column({
    nullable: true,
    comment:
      "Contact type: lead, customer, team_member, advisor, stranger, bot, partner, spammer, or custom",
  })
  contactType: string;

  @Column({
    default: false,
    comment: "Whether contactType was set by LLM auto-detection",
  })
  contactTypeAutoDetected: boolean;

  @Column({ nullable: true, comment: "Follow-up date for CRM tracking" })
  followUpDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  lastSyncedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @OneToMany(() => ContactNote, (note) => note.contact)
  notes: ContactNote[];

  @OneToMany(() => ContactCustomFieldValue, (cfv) => cfv.contact)
  customFieldValueEntries: ContactCustomFieldValue[];

  @OneToMany(() => Deal, (deal) => deal.contact)
  deals: Deal[];
}
