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

import { makeEncryptedColumnTransformer } from "../../encryption/encryption.helper";
import { User } from "./user.entity";

@Entity("github_repo_mappings")
// Note: owner and repo are encrypted columns (random IV per write), so a unique
// index on them is ineffective — identical plaintext produces different ciphertexts
// each time, meaning the DB always sees distinct values and the constraint is never
// enforced.  Duplicate prevention is handled in application logic instead.
@Index(["userId"])
export class GitHubRepoMapping {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({
    transformer: makeEncryptedColumnTransformer("github_repo_mappings.owner"),
  })
  owner: string;

  @Column({
    transformer: makeEncryptedColumnTransformer("github_repo_mappings.repo"),
  })
  repo: string;

  @Column("text", {
    nullable: true,
    transformer: makeEncryptedColumnTransformer(
      "github_repo_mappings.emailCategories",
    ),
    comment:
      "Comma-separated email categories this repo is associated with (e.g. 'Engineering,Bug Reports')",
  })
  emailCategories: string | null;

  @Column("text", {
    nullable: true,
    transformer: makeEncryptedColumnTransformer("github_repo_mappings.context"),
    comment:
      "Additional context about when to use this repo for issue creation",
  })
  context: string | null;

  @Column({
    default: false,
    comment: "Whether this mapping was auto-discovered from GitHub emails",
  })
  isAutoDiscovered: boolean;

  @Column({
    default: false,
    comment: "Whether this is the default repo for new issues",
  })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
