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

@Entity("scheduling_preferences")
@Index(["userId"], { unique: true })
export class SchedulingPreference {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "int", default: 9 })
  availabilityStartHour: number;

  @Column({ type: "int", default: 17 })
  availabilityEndHour: number;

  @Column("simple-array", {
    default: "1,2,3,4,5",
  })
  availabilityDays: number[];

  @Column({ type: "int", default: 30 })
  meetingGapMinutes: number;

  @Column({ type: "int", default: 2 })
  deepWorkHoursPerDay: number;

  @Column({ type: "int", default: 30 })
  slotDurationMinutes: number;

  @Column({ default: "UTC" })
  timezone: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
