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

/**
 * A local Apple Mail (Mail.app) account connected via AppleScript/JXA.
 * Unlike the OAuth providers there are no tokens — the server can only talk
 * to Mail.app when it runs on the same Mac as the user's Mail database, so a
 * row here just records which Mail.app account the user chose to mirror.
 */
@Entity("apple_mail_accounts")
@Index(["userId"])
export class AppleMailAccount {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({
    comment:
      "Account name exactly as shown in Mail.app - used to address the account via AppleScript",
  })
  accountName: string;

  @Column({
    transformer: makeEncryptedColumnTransformer("apple_mail_accounts.email"),
    comment: "Email address (encrypted)",
  })
  email: string;

  @Column({ nullable: true, comment: "Display name" })
  name: string;

  @Column({ default: true, comment: "Can be disabled without deleting" })
  isActive: boolean;

  @Column({
    default: true,
    comment: "Primary account for this user (only one can be primary)",
  })
  isPrimary: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.appleMailAccounts, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "userId" })
  user: User;
}
