import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import { encryptedColumnTransformer, emailTransformer, EncryptionHelper } from '../../encryption/encryption.helper';

@Entity('waitlist')
export class Waitlist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  emailHash: string; // SHA-256 hash for querying (not encrypted)

  @Column({ transformer: emailTransformer })
  email: string; // Encrypted actual email

  @Column({ transformer: encryptedColumnTransformer })
  firstName: string;

  @Column('text', { transformer: encryptedColumnTransformer })
  reason: string;

  @Column({ default: false })
  approved: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

