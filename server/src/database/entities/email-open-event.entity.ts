import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { OpenSource } from "../../constants/email-tracking.constants";
import { makeGlobalEncryptedColumnTransformer } from "../../encryption/encryption.helper";
import { EmailTracking } from "./email-tracking.entity";

/**
 * A single counted pixel hit. Grace-window and duplicate hits are never stored.
 *
 * IP and user agent use the GLOBAL key: they are written by the public pixel
 * route, which runs without a signed-in user and so has no per-user KMS key.
 */
@Entity("email_open_events")
@Index("IDX_email_open_events_tracking_opened", ["trackingId", "openedAt"])
export class EmailOpenEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  trackingId: string;

  @Column({ type: "timestamptz" })
  openedAt: Date;

  @Column({ type: "varchar", length: 30 })
  openSource: OpenSource;

  /** True for Apple Mail Privacy Protection prefetches. */
  @Column({ default: false })
  isLikelyAutomatic: boolean;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeGlobalEncryptedColumnTransformer(
      "email_open_events.ipAddress",
    ),
  })
  ipAddress: string | null;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeGlobalEncryptedColumnTransformer(
      "email_open_events.userAgent",
    ),
  })
  userAgent: string | null;

  @ManyToOne(() => EmailTracking, (tracking) => tracking.openEvents, {
    onDelete: "CASCADE",
  })
  @JoinColumn({
    name: "trackingId",
    foreignKeyConstraintName: "FK_email_open_events_tracking",
  })
  tracking: EmailTracking;
}
