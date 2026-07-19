import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("debug_config")
export class DebugConfig {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 100, unique: true })
  feature: string;

  @Column({ type: "boolean", default: false })
  enabled: boolean;

  @Column({ type: "varchar", length: 500, nullable: true })
  description: string | null;

  @Column({ type: "int", default: 7 })
  retentionDays: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
