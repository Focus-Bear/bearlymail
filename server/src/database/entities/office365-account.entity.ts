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

@Entity("office365_accounts")
@Index(["userId"])
@Index(["microsoftId"])
export class Office365Account {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ comment: "Microsoft user ID" })
  @Index()
  microsoftId: string;

  @Column({
    transformer: makeEncryptedColumnTransformer("office365_accounts.email"),
    comment: "Email address (encrypted)",
  })
  email: string;

  @Column({ nullable: true, comment: "Display name from Microsoft" })
  name: string;

  @Column({
    transformer: makeEncryptedColumnTransformer(
      "office365_accounts.accessToken",
    ),
    comment: "Microsoft OAuth access token (encrypted)",
  })
  accessToken: string;

  @Column({
    transformer: makeEncryptedColumnTransformer(
      "office365_accounts.refreshToken",
    ),
    comment: "Microsoft OAuth refresh token (encrypted)",
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

  @ManyToOne(() => User, (user) => user.office365Accounts, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "userId" })
  user: User;
}
