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

@Entity("zoho_accounts")
@Index(["userId"])
@Index(["zohoId"])
export class ZohoAccount {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ comment: "Zoho user ID" })
  @Index()
  zohoId: string;

  @Column({
    transformer: makeEncryptedColumnTransformer("zoho_accounts.email"),
    comment: "Email address (encrypted)",
  })
  email: string;

  @Column({ nullable: true, comment: "Display name from Zoho" })
  name: string;

  @Column({
    transformer: makeEncryptedColumnTransformer("zoho_accounts.accessToken"),
    comment: "Zoho OAuth access token (encrypted)",
  })
  accessToken: string;

  @Column({
    transformer: makeEncryptedColumnTransformer("zoho_accounts.refreshToken"),
    comment: "Zoho OAuth refresh token (encrypted)",
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

  @Column({
    nullable: true,
    comment:
      "Zoho accounts-server URL for this account's data center, e.g. https://accounts.zoho.com.au. Detected from OAuth callback.",
  })
  accountsServer: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.zohoAccounts, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
