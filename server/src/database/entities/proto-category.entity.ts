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

/**
 * ProtoCategory represents a proposed category that hasn't been promoted to a real category yet.
 * When an email doesn't match any existing category or proto category, a new proto category is suggested.
 * Once a proto category reaches the promotion threshold (PROMOTION_THRESHOLD emails assigned),
 * it gets promoted to a real category (UserContext with EMAIL_CATEGORY key).
 */
@Entity("proto_categories")
@Index(["userId", "isPromoted"])
@Index(["userId", "name"], { unique: true })
export class ProtoCategory {
  // Number of emails needed to promote proto category to real category
  static readonly PROMOTION_THRESHOLD = 5;

  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column("text", {
    transformer: encryptedColumnTransformer,
    comment: "Proto category name (e.g., '🔧 Technical Issues')",
  })
  name: string;

  @Column("text", {
    nullable: true,
    transformer: encryptedColumnTransformer,
    comment: "Description of what emails belong in this proto category",
  })
  description: string | null;

  @Column({
    type: "int",
    default: 1,
    comment: "Number of emails assigned to this proto category",
  })
  emailCount: number;

  @Column({
    default: false,
    comment: "Whether this proto category has been promoted to a real category",
  })
  isPromoted: boolean;

  @Column({
    type: "uuid",
    nullable: true,
    comment:
      "ID of the UserContext created when this proto category was promoted",
  })
  promotedCategoryId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;
}
