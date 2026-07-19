import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { makeEncryptedColumnTransformer } from "../../encryption/encryption.helper";
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
 * How a connection authenticates to its MCP server.
 * - "none"   — no auth
 * - "bearer" — static API key / token sent as `Authorization: Bearer`
 * - "oauth"  — MCP-native OAuth 2.0 (metadata discovery + dynamic client
 *   registration + PKCE authorization code), with refreshable access tokens
 */
export const MCP_AUTH_TYPES = {
  NONE: "none",
  BEARER: "bearer",
  OAUTH: "oauth",
} as const;

export type MCPAuthType = (typeof MCP_AUTH_TYPES)[keyof typeof MCP_AUTH_TYPES];

/**
 * Subset of an authorization server's discovered metadata (RFC 8414 /
 * OpenID Connect discovery) needed to drive the OAuth flow.
 */
export interface MCPOAuthMetadata {
  issuer?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  scopesSupported?: string[];
}

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
  @Column({
    type: "text",
    transformer: makeEncryptedColumnTransformer("mcp_server_configs.name"),
  })
  name: string;

  /** MCP server endpoint — encrypted */
  @Column({
    type: "text",
    transformer: makeEncryptedColumnTransformer("mcp_server_configs.serverUrl"),
  })
  serverUrl: string;

  /** Encrypted API key / auth credential — null if not required */
  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer("mcp_server_configs.apiKey"),
  })
  apiKey: string | null;

  /** How this connection authenticates. Existing rows default to "bearer". */
  @Column({ type: "text", default: "bearer" })
  authType: MCPAuthType;

  // ── OAuth state (only populated when authType === "oauth") ──────────────────

  /** Encrypted OAuth access token used as the bearer credential. */
  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer(
      "mcp_server_configs.accessToken",
    ),
  })
  accessToken: string | null;

  /** Encrypted OAuth refresh token used to mint new access tokens. */
  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer(
      "mcp_server_configs.refreshToken",
    ),
  })
  refreshToken: string | null;

  /** When the current access token expires (used to refresh proactively). */
  @Column({ type: "timestamp", nullable: true })
  tokenExpiresAt: Date | null;

  /** Encrypted client ID issued by dynamic client registration. */
  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer(
      "mcp_server_configs.oauthClientId",
    ),
  })
  oauthClientId: string | null;

  /** Encrypted client secret, if the authorization server issued one. */
  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer(
      "mcp_server_configs.oauthClientSecret",
    ),
  })
  oauthClientSecret: string | null;

  /** Discovered authorization-server endpoints (public URLs, not secret). */
  @Column({ type: "jsonb", nullable: true })
  oauthMetadata: MCPOAuthMetadata | null;

  /** Space-separated scopes requested during authorization. */
  @Column({ type: "text", nullable: true })
  oauthScope: string | null;

  /** CSRF `state` for the in-flight authorization; cleared once exchanged. */
  @Column({ type: "text", nullable: true })
  oauthAuthState: string | null;

  /** Encrypted PKCE verifier for the in-flight authorization; cleared once used. */
  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer(
      "mcp_server_configs.oauthCodeVerifier",
    ),
  })
  oauthCodeVerifier: string | null;

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
