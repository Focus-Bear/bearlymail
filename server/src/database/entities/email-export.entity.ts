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

import {
  EMAIL_EXPORT_STATUS,
  EmailExportStatus,
} from "../../constants/domain-statuses";
import { User } from "./user.entity";

export type { EmailExportStatus } from "../../constants/domain-statuses";

/**
 * Tracks a single bulk email-export run for a user.
 *
 * The export is built by a background worker (see EXPORT_EMAILS job) rather than
 * inline in the HTTP request, so this row is the handshake between the enqueueing
 * request, the worker, and the client polling for the finished download. The
 * generated ZIP itself lives in S3 (see `s3Key`); only metadata is stored here.
 *
 * No column is encrypted: this table holds no email content — just status,
 * counts, and the opaque S3 object key.
 */
@Entity("email_exports")
@Index(["userId", "status"])
@Index(["userId", "createdAt"])
export class EmailExport {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({
    type: "enum",
    enum: Object.values(EMAIL_EXPORT_STATUS),
    default: EMAIL_EXPORT_STATUS.PENDING,
  })
  status: EmailExportStatus;

  /** S3 object key of the finished ZIP, set once `status === "completed"`. */
  @Column({ type: "text", nullable: true })
  s3Key: string | null;

  /** Size of the generated ZIP in bytes (for display). */
  @Column({ type: "integer", nullable: true })
  fileSize: number | null;

  /** Number of emails included in the export. */
  @Column({ type: "integer", nullable: true })
  emailCount: number | null;

  /** When the S3 object lifecycle will delete the export (informational). */
  @Column({ type: "timestamp with time zone", nullable: true })
  expiresAt: Date | null;

  @Column({ type: "text", nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
