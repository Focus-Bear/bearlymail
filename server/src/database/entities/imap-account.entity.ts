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
 * A mailbox connected over IMAP (reading) + SMTP (sending) with a username and
 * password — hosts without an OAuth API (cPanel, Crazy Domains, Fastmail…).
 * Credentials are encrypted at rest like the OAuth providers' tokens.
 */
@Entity("imap_accounts")
@Index("IDX_imap_accounts_userId", ["userId"])
export class ImapAccount {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({
    type: "text",
    transformer: makeEncryptedColumnTransformer("imap_accounts.email"),
    comment: "Email address (encrypted)",
  })
  email: string;

  @Column({
    type: "varchar",
    nullable: true,
    comment: "Display name used as the From name",
  })
  name: string | null;

  @Column({
    type: "text",
    transformer: makeEncryptedColumnTransformer("imap_accounts.username"),
    comment: "Login username, usually the email address (encrypted)",
  })
  username: string;

  @Column({
    type: "text",
    transformer: makeEncryptedColumnTransformer("imap_accounts.password"),
    comment: "Mailbox or app password (encrypted)",
  })
  password: string;

  @Column({ type: "varchar", comment: "IMAP server hostname" })
  imapHost: string;

  @Column({ type: "integer" })
  imapPort: number;

  @Column({
    default: true,
    comment: "Implicit TLS (993); false = STARTTLS (143)",
  })
  imapSecure: boolean;

  @Column({ type: "varchar", comment: "SMTP server hostname" })
  smtpHost: string;

  @Column({ type: "integer" })
  smtpPort: number;

  @Column({
    default: true,
    comment: "Implicit TLS (465); false = STARTTLS (587)",
  })
  smtpSecure: boolean;

  @Column({
    type: "varchar",
    nullable: true,
    comment: "Mailbox archived threads are moved to (detected or created)",
  })
  archiveMailbox: string | null;

  @Column({
    type: "varchar",
    nullable: true,
    comment:
      "Mailbox sent mail is appended to; null = server keeps its own copy",
  })
  sentMailbox: string | null;

  @Column({
    type: "varchar",
    nullable: true,
    comment: "Mailbox trashed threads go to",
  })
  trashMailbox: string | null;

  @Column({ default: true, comment: "Can be disabled without deleting" })
  isActive: boolean;

  @Column({
    default: true,
    comment: "Primary account for this user (only one can be primary)",
  })
  isPrimary: boolean;

  @Column({
    default: false,
    comment: "Set when the server rejects the stored credentials",
  })
  needsRelogin: boolean;

  @Column({
    type: "text",
    nullable: true,
    comment: "Last connection/sync error, shown in settings",
  })
  lastError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.imapAccounts, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
