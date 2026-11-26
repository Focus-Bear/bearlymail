import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { makeEncryptedJsonTransformer } from "../../encryption/encryption.helper";
import type { CompositeCategoryRuleSpec } from "./category-rule.entity";
import { User } from "./user.entity";
import { UserContext } from "./user-context.entity";

/**
 * Memory of an auto-generated composite category rule the user deleted, so the
 * generator does not recreate it (or a narrower copy of it) on its next run.
 * Rules are hard-deleted, so without this row nothing remembers the rejection.
 *
 * The full spec is kept (encrypted — senders and phrases are user data) rather
 * than a hash, because suppression is a coverage check, not an exact match.
 * Deleting the category deletes its tombstones: a re-created category has a new
 * id and starts with a clean slate.
 */
@Entity("category_rule_tombstones")
@Index("IDX_category_rule_tombstones_userId_categoryId", [
  "userId",
  "categoryId",
])
export class CategoryRuleTombstone {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "uuid" })
  categoryId: string;

  @Column("text", {
    transformer: makeEncryptedJsonTransformer(
      "category_rule_tombstones.compositeSpec",
    ),
  })
  compositeSpec: CompositeCategoryRuleSpec;

  /** Id the deleted rule had; kept for logs, the row itself is gone. */
  @Column({ type: "uuid" })
  deletedRuleId: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @ManyToOne(() => UserContext, { onDelete: "CASCADE" })
  @JoinColumn({ name: "categoryId", referencedColumnName: "contextId" })
  category: UserContext;
}
