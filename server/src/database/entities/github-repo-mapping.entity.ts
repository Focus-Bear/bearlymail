import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.entity";
import { encryptedColumnTransformer } from "../../encryption/encryption.helper";

@Entity("github_repo_mappings")
@Index(["userId", "owner", "repo"], { unique: true })
@Index(["userId"])
export class GitHubRepoMapping {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ transformer: encryptedColumnTransformer })
  owner: string;

  @Column({ transformer: encryptedColumnTransformer })
  repo: string;

  @Column("text", {
    nullable: true,
    transformer: encryptedColumnTransformer,
    comment:
      "Comma-separated email categories this repo is associated with (e.g. 'Engineering,Bug Reports')",
  })
  emailCategories: string | null;

  @Column("text", {
    nullable: true,
    transformer: encryptedColumnTransformer,
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

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;
}
