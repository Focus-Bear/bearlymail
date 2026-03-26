import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { encryptedColumnTransformer } from "../../encryption/encryption.helper";
import { OrganizationMember } from "./organization-member.entity";
import { User } from "./user.entity";

@Entity("organizations")
export class Organization {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ transformer: encryptedColumnTransformer })
  name: string;

  @Column({ type: "uuid" })
  @Index()
  ownerId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "ownerId" })
  owner: User;

  @OneToMany(() => OrganizationMember, (member) => member.organization)
  members: OrganizationMember[];

  @Column({ type: "int", default: 0, comment: "Max paid seats for this org" })
  maxSeats: number;

  @Column({
    type: "varchar",
    nullable: true,
    comment: "RevenueCat subscription ID for the org-level billing",
  })
  revenueCatOrgSubscriptionId: string | null;

  @Column({
    type: "varchar",
    nullable: true,
    comment: "Volume tier product ID from RevenueCat (starter|growth|business)",
  })
  volumeTierProductId: string | null;

  @Column({
    type: "int",
    default: 0,
    comment: "Emails processed this billing cycle",
  })
  emailsUsedThisCycle: number;

  @Column({
    type: "int",
    default: 3000,
    comment: "Email volume limit based on tier",
  })
  emailVolumeLimit: number;

  @Column({
    type: "timestamp",
    nullable: true,
    comment: "Start of current billing cycle for volume tracking",
  })
  billingCycleStart: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
