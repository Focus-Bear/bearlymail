import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.entity";
import { EmailThread } from "./email-thread.entity";

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

  @Column({ type: "varchar", length: 100, nullable: true })
  originalCategory: string | null;

  @Column({ type: "varchar", length: 100 })
  userCategory: string;

  @Column("text", {
    nullable: true,
    comment: "User explanation for the change",
  })
  reasonText: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;

  @ManyToOne(() => EmailThread)
  @JoinColumn({ name: "emailThreadId" })
  emailThread: EmailThread;
}
