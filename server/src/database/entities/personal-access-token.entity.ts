import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { User } from "./user.entity";

/**
 * A long-lived, scoped bearer token a user creates for an external client
 * (e.g. Claude via the `/mcp` endpoint). Only the SHA-256 hash of the token is
 * stored; the plaintext is shown once at creation.
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

  /** User-chosen label, e.g. "Claude Desktop". */
  @Column({ type: "varchar" })
  name: string;

  /** Hex SHA-256 of the full token; the lookup key on every request. */
  @Index({ unique: true })
  @Column({ type: "varchar" })
  tokenHash: string;

  /** First characters of the token, safe to display ("bm_pat_AbC1"). */
  @Column({ type: "varchar" })
  tokenPrefix: string;

  @Column({ type: "text", array: true })
  scopes: string[];

  @Column({ type: "timestamptz", nullable: true })
  expiresAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
