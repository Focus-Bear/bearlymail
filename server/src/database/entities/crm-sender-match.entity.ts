import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { makeEncryptedColumnTransformer } from "../../encryption/encryption.helper";
import { MCPServerConfig } from "./mcp-server-config.entity";
import { User } from "./user.entity";

/**
 * Which CRM record a sender resolved to on one CRM connection, so later
 * lookups fetch that record by ID instead of searching again.
 *
 * A row with no `recordId` is a remembered miss ("this sender isn't in the
 * CRM"), honoured only for a short TTL. `connectionFingerprint` pins the match
 * to the connection it was found on: reconnecting the same server to a
 * different CRM org changes the fingerprint, and the stale match is ignored.
 */
@Entity("crm_sender_matches")
@Index(
  "IDX_crm_sender_matches_userId_serverId_emailHash",
  ["userId", "serverId", "emailHash"],
  {
    unique: true,
  },
)
export class CrmSenderMatch {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  /** The CRM connection (MCP server config) the match was found on. */
  @Column()
  serverId: string;

  @ManyToOne(() => MCPServerConfig, { onDelete: "CASCADE" })
  @JoinColumn({ name: "serverId" })
  server: MCPServerConfig;

  /** SHA-256 of the connection's URL + OAuth issuer when the match was made. */
  @Column()
  connectionFingerprint: string;

  /** SHA-256 of the lowercased, trimmed sender email (same as Contact.emailHash). */
  @Column()
  emailHash: string;

  /** CRM module of the matched record (e.g. Bigin "Contacts" / "Accounts"); null for a miss. */
  @Column({ type: "varchar", nullable: true })
  recordModule: string | null;

  /** CRM record ID; null for a remembered miss. */
  @Column({ type: "varchar", nullable: true })
  recordId: string | null;

  /** Contact or company name at match time — encrypted. */
  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer(
      "crm_sender_matches.displayName",
    ),
  })
  displayName: string | null;

  /** How many records matched the search; above 1 means the most recent was kept. */
  @Column({ type: "integer", default: 1 })
  matchCount: number;

  /** When the match (or miss) was recorded; drives the miss TTL. */
  @Column({ type: "timestamp" })
  matchedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
