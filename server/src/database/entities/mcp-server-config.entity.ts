import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { encryptedColumnTransformer } from "../../encryption/encryption.helper";
import { User } from "./user.entity";

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
}

/**
 * MCPServerConfig — stores connection details for a user-configured MCP server.
 * Credentials (serverUrl, apiKey) are encrypted at rest.
 *
 * Part of feature #1483 — Automated Email Workflows.
 */
@Entity("mcp_server_configs")
export class MCPServerConfig {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  /** Display name (e.g. "Focus Bear") — encrypted */
  @Column({ type: "text", transformer: encryptedColumnTransformer })
  name: string;

  /** MCP server endpoint — encrypted */
  @Column({ type: "text", transformer: encryptedColumnTransformer })
  serverUrl: string;

  /** Encrypted API key / auth credential — null if not required */
  @Column({
    type: "text",
    nullable: true,
    transformer: encryptedColumnTransformer,
  })
  apiKey: string | null;

  /**
   * Cached tool definitions from the MCP server's tools/list endpoint.
   * Refreshed on demand via POST /api/mcp-servers/:id/refresh.
   */
  @Column({ type: "jsonb", nullable: true })
  cachedTools: MCPToolDefinition[] | null;

  @Column({ type: "timestamp", nullable: true })
  toolsCachedAt: Date | null;

  @Column({ type: "boolean", default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
