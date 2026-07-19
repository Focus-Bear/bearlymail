import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

import { makeEncryptedColumnTransformer } from "../../encryption/encryption.helper";

@Entity("feedback")
export class Feedback {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** AES-256-GCM encrypted user email address */
  @Column({
    nullable: true,
    transformer: makeEncryptedColumnTransformer("feedback.userEmailEncrypted"),
  })
  userEmailEncrypted: string | null;

  @Column({ type: "text" })
  message: string;

  /** S3 key for an uploaded screenshot, if provided */
  @Column({ nullable: true })
  screenshotS3Key: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  appVersion: string | null;

  @Column({ nullable: true })
  userAgent: string | null;
}
