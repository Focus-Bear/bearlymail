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

import { User } from "./user.entity";

export const DEFAULT_DEAL_STAGES = [
  { name: "Prospect", sortOrder: 0 },
  { name: "Qualified", sortOrder: 1 },
  { name: "Proposal", sortOrder: 2 },
  { name: "Negotiation", sortOrder: 3 },
  { name: "Closed Won", sortOrder: 4 },
  { name: "Closed Lost", sortOrder: 5 },
] as const;

@Entity("deal_stages")
@Index(["userId", "sortOrder"])
@Index(["userId", "name"], { unique: true })
export class DealStage {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column()
  name: string;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({
    nullable: true,
    comment: "Color hex for kanban column header",
  })
  color: string;

  @Column({
    default: false,
    comment: "Treat deals in this stage as closed/won",
  })
  isWon: boolean;

  @Column({
    default: false,
    comment: "Treat deals in this stage as closed/lost",
  })
  isLost: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
