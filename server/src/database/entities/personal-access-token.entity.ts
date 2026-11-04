import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import {
  ACCESS_TOKEN_KINDS,
  AccessTokenKind,
} from "../../constants/personal-access-tokens.constants";
import { User } from "./user.entity";

/**
 * A scoped bearer credential for an external client (e.g. Claude via the
 * `/mcp` endpoint): either a long-lived token the user creates by hand, or an
 * OAuth connection whose short-lived access token and refresh token rotate in
 * place on this row. Only SHA-256 hashes are stored.
 */
@Entity("personal_access_tokens")
@Index(["userId", "revokedAt"])
export class PersonalAccessToken {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "varchar", default: ACCESS_TOKEN_KINDS.PERSONAL })
  kind: AccessTokenKind;

  /** User-chosen label ("Claude Desktop"), or the OAuth client's name and host. */
  @Column({ type: "varchar" })
  name: string;

  /** Hex SHA-256 of the full (access) token; the lookup key on every request. */
  @Index({ unique: true })
  @Column({ type: "varchar" })
  tokenHash: string;

  /** First characters of the token, safe to display ("bm_pat_AbC1"). */
  @Column({ type: "varchar" })
  tokenPrefix: string;

  @Column({ type: "text", array: true })
  scopes: string[];

  /** For OAuth rows this is the current access token's expiry. */
  @Column({ type: "timestamptz", nullable: true })
  expiresAt: Date | null;

  /** OAuth only: the client_id (metadata document URL or registered id). */
  @Column({ type: "varchar", nullable: true })
  oauthClientId: string | null;

  /** OAuth only: hex SHA-256 of the current refresh token. */
  @Index("IDX_personal_access_tokens_refreshTokenHash", { unique: true })
  @Column({ type: "varchar", nullable: true })
  refreshTokenHash: string | null;

  /** OAuth only: the connection lapses if not refreshed by then. */
  @Column({ type: "timestamptz", nullable: true })
  refreshTokenExpiresAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
