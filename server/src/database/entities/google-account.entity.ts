import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { makeEncryptedColumnTransformer } from "../../encryption/encryption.helper";
import { User } from "./user.entity";

@Entity("google_accounts")
@Index(["userId"])
@Index(["googleId"])
export class GoogleAccount {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ comment: "Google user ID" })
  @Index()
  googleId: string;

  @Column({
    transformer: makeEncryptedColumnTransformer("google_accounts.email"),
    comment: "Gmail address (encrypted)",
  })
  email: string;

  @Column({ nullable: true, comment: "Display name from Google" })
  name: string;

  @Column({
    transformer: makeEncryptedColumnTransformer("google_accounts.accessToken"),
    comment: "Google OAuth access token (encrypted)",
  })
  accessToken: string;

  @Column({
    transformer: makeEncryptedColumnTransformer("google_accounts.refreshToken"),
    comment: "Google OAuth refresh token (encrypted)",
  })
  refreshToken: string;

  @Column({ default: true, comment: "Can be disabled without deleting" })
  isActive: boolean;

  @Column({
    default: true,
    comment: "Primary account for this user (only one can be primary)",
  })
  isPrimary: boolean;

  @Column({ default: false, comment: "Flag if tokens need to be refreshed" })
  needsRelogin: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.googleAccounts, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
