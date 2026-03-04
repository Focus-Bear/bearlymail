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

@Entity("contact_types")
@Index(["userId", "name"], { unique: true })
export class ContactType {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ comment: "Lowercase slug: lead, customer, team_member, etc." })
  name: string;

  @Column({ comment: "Display label: Lead, Customer, Team Member, etc." })
  label: string;

  @Column({ nullable: true, comment: "Color hex for badge display" })
  color: string;

  @Column({ nullable: true, comment: "Icon or emoji for badge" })
  icon: string;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({
    default: false,
    comment: "Default types seeded by the system vs user-created",
  })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
