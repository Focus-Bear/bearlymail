import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

/**
 * An OAuth client registered through RFC 7591 dynamic client registration
 * (`POST /oauth/register`). Clients that identify with a Client ID Metadata
 * Document (claude.ai, Claude Code) are never stored here. Everything is
 * self-asserted by the client, so the consent screen shows the redirect host.
 */
@Entity("oauth_clients")
export class OAuthClient {
  /** The issued client_id. */
  @PrimaryColumn({ type: "varchar" })
  id: string;

  @Column({ type: "varchar" })
  clientName: string;

  @Column({ type: "text", array: true })
  redirectUris: string[];

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
