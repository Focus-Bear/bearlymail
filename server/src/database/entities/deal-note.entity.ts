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
import { Deal } from "./deal.entity";
import { User } from "./user.entity";

/**
 * A free-text note on a deal. Carries userId as well as dealId so every
 * lookup can be scoped to the owner without a join.
 */
@Entity("deal_notes")
@Index("IDX_deal_notes_dealId", ["dealId"])
@Index("IDX_deal_notes_userId", ["userId"])
export class DealNote {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  dealId: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({
    type: "text",
    transformer: makeEncryptedColumnTransformer("deal_notes.content"),
  })
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Deal, { onDelete: "CASCADE" })
  @JoinColumn({ name: "dealId" })
  deal: Deal;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
