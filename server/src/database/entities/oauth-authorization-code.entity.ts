import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * One pass through `/oauth/authorize`. Created when a client starts the flow
 * (its id is what the consent page loads), gains a user, granted scopes and a
 * code hash when the user approves, and is consumed when the code is
 * exchanged. A replayed code revokes the connection it produced.
 */
@Entity("oauth_authorization_codes")
export class OAuthAuthorizationCode {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar" })
  clientId: string;

  /** Display name resolved at request time (self-asserted by the client). */
  @Column({ type: "varchar" })
  clientName: string;

  @Column({ type: "text" })
  redirectUri: string;

  /** Client's opaque CSRF value, echoed back on the redirect. */
  @Column({ type: "text", nullable: true })
  state: string | null;

  /** S256 PKCE challenge (base64url SHA-256 of the verifier). */
  @Column({ type: "varchar" })
  codeChallenge: string;

  @Column({ type: "text", array: true })
  requestedScopes: string[];

  @Column({ type: "timestamptz" })
  expiresAt: Date;

  @Column({ type: "uuid", nullable: true })
  userId: string | null;

  @Column({ type: "text", array: true, nullable: true })
  grantedScopes: string[] | null;

  @Index("IDX_oauth_authorization_codes_codeHash", { unique: true })
  @Column({ type: "varchar", nullable: true })
  codeHash: string | null;

  @Column({ type: "timestamptz", nullable: true })
  codeExpiresAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  consumedAt: Date | null;

  /** The connection this code produced, revoked if the code is replayed. */
  @Column({ type: "uuid", nullable: true })
  issuedTokenId: string | null;

  @Index("IDX_oauth_authorization_codes_createdAt")
  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
