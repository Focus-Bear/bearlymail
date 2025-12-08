import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';
import { encryptedColumnTransformer } from '../../encryption/encryption.helper';

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
@Entity('contacts')
@Index(['userId', 'emailHash']) // Fast lookup by email
@Index(['userId', 'provider', 'providerId'], { unique: true }) // Prevent duplicates from same provider
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  // Provider information (for sync tracking)
  @Column({ default: 'manual' })
  provider: string; // 'gmail', 'outlook', 'manual', etc.

  @Column({ nullable: true })
  providerId: string; // Provider-specific ID (e.g., Google People resourceName)

  // Encrypted fields
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

  // Blind index for email (SHA-256 hash) - enables exact email lookups
  @Column()
  @Index()
  emailHash: string;

  // Search tokens - hashed trigrams and normalized tokens for fuzzy search
  // Stored as JSON array of hashes: ["abc123...", "def456...", ...]
  // Generated from: email domain, name parts, company name
  @Column('text', { nullable: true })
  searchTokens: string; // JSON array of hashed tokens

  // Metadata
  @Column({ default: false })
  isFavorite: boolean;

  @Column({ nullable: true })
  lastContactedAt: Date;

  @Column({ default: 0 })
  contactFrequency: number; // How often user emails this contact

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  lastSyncedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}




