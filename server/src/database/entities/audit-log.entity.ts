import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

import {
  makeEncryptedColumnTransformer,
  makeEncryptedJsonTransformer,
} from "../../encryption/encryption.helper";

/**
 * SAQ Q52 / GAP-12: append-only audit trail of access to sensitive admin endpoints.
 * Rows are written by AuditService; the entity is intentionally read-only from the
 * application layer (no update/delete methods exposed).
 */
@Entity("audit_logs")
@Index(["userId", "createdAt"])
@Index(["action", "createdAt"])
export class AuditLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** The actor (admin user) performing the action. Nullable in case the user is later removed. */
  @Column({ type: "uuid", nullable: true })
  userId: string | null;

  /** The endpoint or operation, e.g. "GET /feedback/admin" or "admin.viewUserData". */
  @Column({ type: "text" })
  action: string;

  /** Optional resource type (e.g. "User", "Email", "Feedback"). */
  @Column({ type: "text", nullable: true })
  targetType: string | null;

  /** Optional resource id. */
  @Column({ type: "text", nullable: true })
  targetId: string | null;

  /** Encrypted JSON metadata: request params, query, body summary, etc. */
  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedJsonTransformer("audit_logs.metadata"),
  })
  metadata: Record<string, unknown> | null;

  /** Source IP address. Stored encrypted to avoid casual exposure. */
  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer("audit_logs.ipAddress"),
  })
  ipAddress: string | null;

  /** User-Agent header. Stored encrypted (fingerprintable). */
  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer("audit_logs.userAgent"),
  })
  userAgent: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
