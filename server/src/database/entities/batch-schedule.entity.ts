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

export enum DayOfWeek {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
}

@Entity("batch_schedules")
// Each user has one schedule
@Index(["userId"], { unique: true })
export class BatchSchedule {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  // Days when emails should be delivered (array of day numbers 0-6)
  @Column("simple-array", { comment: "e.g., [1, 2, 3, 4, 5] for weekdays" })
  deliveryDays: number[];

  // Times of day when non-urgent emails are released (24h format, e.g., ["11:00", "15:00"])
  @Column("simple-array")
  deliveryTimes: string[];

  // Whether batching is enabled
  @Column({ default: true })
  isEnabled: boolean;

  // Timezone for the schedule (e.g., "Australia/Sydney")
  @Column({ default: "UTC" })
  timezone: string;

  // Whether urgent emails bypass the schedule
  @Column({ default: true })
  urgentBypassSchedule: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
