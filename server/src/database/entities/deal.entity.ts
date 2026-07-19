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

import {
  makeEncryptedColumnTransformer,
  makeEncryptedJsonTransformer,
} from "../../encryption/encryption.helper";
import { Contact } from "./contact.entity";
import { DealStage } from "./deal-stage.entity";
import { User } from "./user.entity";

@Entity("deals")
@Index(["userId", "stageId"])
@Index(["userId", "contactId"])
export class Deal {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  contactId: string;

  @Column({ nullable: true })
  stageId: string;

  @Column({ transformer: makeEncryptedColumnTransformer("deals.title") })
  title: string;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer("deals.details"),
    comment: "Details/description of the deal",
  })
  details: string;

  @Column({
    type: "decimal",
    precision: 12,
    scale: 2,
    nullable: true,
    comment: "Monetary value of the deal",
  })
  value: number;

  @Column({
    nullable: true,
    default: "USD",
    comment: "Currency code (ISO 4217)",
  })
  currency: string;

  @Column({ nullable: true, comment: "Expected close date" })
  expectedCloseDate: Date;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedJsonTransformer("deals.metadata"),
    comment: "Arbitrary metadata as encrypted JSON",
  })
  metadata: Record<string, unknown> | null;

  @Column({ default: 0, comment: "Sort order within a stage column" })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @ManyToOne(() => Contact, (contact) => contact.deals, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "contactId" })
  contact: Contact;

  @ManyToOne(() => DealStage, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "stageId" })
  stage: DealStage;
}
