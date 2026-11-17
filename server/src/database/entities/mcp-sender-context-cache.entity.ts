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

import { makeEncryptedJsonTransformer } from "../../encryption/encryption.helper";
import type { CrmSenderContext } from "../../mcp/crm-sender-context.types";
import { User } from "./user.entity";

/**
 * A single sender-context result from one MCP server.
 * `text` is the human-readable context extracted from the tool's response.
 * `crm` is set when a known CRM (Zoho Bigin) was queried with fixed lookups,
 * so the card and any LLM step can use typed fields instead of raw text.
 */
export interface MCPSenderContextEntry {
  serverId: string;
  serverName: string;
  toolName: string;
  text: string;
  crm?: CrmSenderContext;
}

/**
 * MCPSenderContextCache — per-sender cache of MCP-sourced context, keyed by the
 * SHA-256 hash of the sender's email (same hashing as Contact.emailHash).
 *
 * Sender context is fetched lazily when an email is opened, then cached here
 * (encrypted) with a short TTL so repeat opens of the same sender are cheap and
 * don't re-hit the external CRM. Not coupled to Contact, so senders without a
 * contact row are still cached.
 */
@Entity("mcp_sender_context_cache")
@Index(["userId", "emailHash"], { unique: true })
export class MCPSenderContextCache {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  /** SHA-256 of the lowercased, trimmed sender email — not encrypted, used for lookup. */
  @Column()
  emailHash: string;

  /** Encrypted JSON array of per-server context entries. */
  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedJsonTransformer(
      "mcp_sender_context_cache.entries",
    ),
  })
  entries: MCPSenderContextEntry[] | null;

  @CreateDateColumn()
  createdAt: Date;

  /** When the context was last fetched from the MCP server(s); drives TTL. */
  @UpdateDateColumn()
  fetchedAt: Date;
}
