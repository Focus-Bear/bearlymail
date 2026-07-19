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

export type CustomFieldType = "text" | "number" | "date" | "select" | "url";

@Entity("contact_custom_fields")
@Index(["userId", "fieldName"], { unique: true })
export class ContactCustomField {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ comment: "Display name for the field" })
  fieldName: string;

  @Column({ default: "text", comment: "text, number, date, select, url" })
  fieldType: CustomFieldType;

  @Column({
    type: "text",
    nullable: true,
    comment:
      'JSON array of options for select type, e.g. ["Option A","Option B"]',
  })
  options: string;

  @Column({ default: 0, comment: "Display order" })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
