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

@Entity("debug_data")
@Index(["feature", "createdAt"])
@Index(["userId", "feature"])
export class DebugData {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid", nullable: true })
  userId: string | null;

  @Column({ type: "varchar", length: 100 })
  feature: string;

  @Column({ type: "jsonb", default: {} })
  payload: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User | null;
}
