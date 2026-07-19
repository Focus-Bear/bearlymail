import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { makeEncryptedColumnTransformer } from "../../encryption/encryption.helper";
import { EmailThread } from "./email-thread.entity";
import { User } from "./user.entity";

@Entity("category_overrides")
@Index(["userId", "emailThreadId"])
@Index(["emailThreadId"])
@Index(["userId", "createdAt"])
export class CategoryOverride {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  emailThreadId: string;

  @Column()
  userId: string;

  @Column("text", {
    nullable: true,
    transformer: makeEncryptedColumnTransformer(
      "category_overrides.originalCategory",
    ),
  })
  originalCategory: string | null;

  @Column("text", {
    transformer: makeEncryptedColumnTransformer(
      "category_overrides.userCategory",
    ),
  })
  userCategory: string;

  @Column("text", {
    nullable: true,
    comment: "User explanation for the change",
  })
  reasonText: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @ManyToOne(() => EmailThread)
  @JoinColumn({ name: "emailThreadId" })
  emailThread: EmailThread;
}
