import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("sync_history_logs")
@Index(["userId", "syncedAt"])
export class SyncHistoryLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @CreateDateColumn({ type: "timestamptz" })
  syncedAt: Date;

  @Column({ type: "timestamptz", nullable: true })
  completedAt: Date | null;

  @Column({ type: "varchar", length: 32, default: "gmail" })
  provider: string;

  @Column({ type: "timestamptz", nullable: true })
  syncWindowStart: Date | null;

  @Column({ type: "jsonb", nullable: true })
  queries: string[] | null;

  @Column({ type: "int", nullable: true })
  threadsFound: number | null;

  @Column({ type: "int", nullable: true })
  durationMs: number | null;

  @Column({ type: "text", nullable: true })
  errorMessage: string | null;

  @Column({ type: "boolean", default: false })
  isContinuation: boolean;
}
