import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.entity";
import { encryptedColumnTransformer } from "../../encryption/encryption.helper";

@Entity("google_accounts")
@Index(["userId"])
@Index(["googleId"])
export class GoogleAccount {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column()
  @Index()
  googleId: string; // Google user ID

  @Column({ transformer: encryptedColumnTransformer })
  email: string; // Gmail address (encrypted)

  @Column({ nullable: true })
  name: string; // Display name from Google

  @Column({ transformer: encryptedColumnTransformer })
  accessToken: string; // Google OAuth access token (encrypted)

  @Column({ transformer: encryptedColumnTransformer })
  refreshToken: string; // Google OAuth refresh token (encrypted)

  @Column({ default: true })
  isActive: boolean; // Can be disabled without deleting

  @Column({ default: true })
  isPrimary: boolean; // Primary account for this user (only one can be primary)

  @Column({ default: false })
  needsRelogin: boolean; // Flag if tokens need to be refreshed

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.googleAccounts, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
