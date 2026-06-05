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

/**
 * Optional behaviour hints an MCP server may advertise per tool (MCP spec
 * `annotations`). Used to keep known-destructive tools away from the Ask AI
 * assistant, which calls tools autonomously.
 */
export interface MCPToolAnnotations {
  title?: string;
  /** True if the tool does not modify its environment. */
  readOnlyHint?: boolean;
  /** True if the tool may perform destructive (irreversible) updates. */
  destructiveHint?: boolean;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: MCPToolAnnotations;
}

/**
 * What an MCP server connection is used for.
 * - "workflow"       — invoked by user-defined workflow rules (feature #1483)
 * - "sender_context" — queried to enrich the email-detail view with context
 *   about the sender (e.g. CRM data from HubSpot)
 * - "ask_ai"         — exposed to the Ask AI assistant as callable tools so it
 *   can answer questions using external resources (e.g. Google Drive)
 */
export const MCP_SERVER_PURPOSES = {
  WORKFLOW: "workflow",
  SENDER_CONTEXT: "sender_context",
  ASK_AI: "ask_ai",
} as const;

export type MCPServerPurpose =
  (typeof MCP_SERVER_PURPOSES)[keyof typeof MCP_SERVER_PURPOSES];

/**
 * Cached decision of which tool to call (and with which argument) to look up a
 * person by email on a sender-context server. Derived once per server by the LLM
 * (see MCPSenderMappingService) and reused as a cheap deterministic call.
 */
export interface MCPSenderLookupMapping {
  /** Name of the tool to invoke for a sender lookup. */
  toolName: string;
  /** Name of the tool input argument that takes the sender's email address. */
  emailArgName: string;
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

  /**
   * What this server is used for. Existing rows default to "workflow" so the
   * Automated Workflows feature is unaffected.
   */
  @Column({ type: "text", default: "workflow" })
  purpose: MCPServerPurpose;

  /**
   * For sender-context servers: the LLM-derived tool + argument used to look up
   * a sender by email. Null until derived, or if no suitable tool was found.
   */
  @Column({ type: "jsonb", nullable: true })
  senderLookupMapping: MCPSenderLookupMapping | null;

  @Column({ type: "boolean", default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
