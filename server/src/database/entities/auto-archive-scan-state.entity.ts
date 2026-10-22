import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { User } from "./user.entity";

/**
 * Per-user watermark for the auto-archive proposal miner, so each run only
 * re-analyses senders with enough new mail since the previous run (plus a
 * periodic full pass that picks up changed engagement on older mail).
 */
@Entity("auto_archive_scan_states")
export class AutoArchiveScanState {
  @PrimaryColumn({ type: "uuid" })
  userId: string;

  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "timestamptz", nullable: true })
  lastScannedAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  lastFullScanAt: Date | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
