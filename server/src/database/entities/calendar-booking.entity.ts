import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./user.entity";

@Entity("calendar_bookings")
export class CalendarBooking {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ unique: true })
  bookingToken: string;

  @Column()
  googleEventId: string;

  @Column()
  guestEmail: string;

  @Column({ nullable: true })
  guestName: string;

  @Column()
  startTime: string;

  @Column()
  endTime: string;

  @Column({ type: "int" })
  durationMinutes: number;

  @Column({ nullable: true })
  title: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ default: "active" })
  // active, cancelled, rescheduled
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
