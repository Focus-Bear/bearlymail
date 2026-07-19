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

import {
  ORG_PLAN_STATUS,
  OrgPlanStatus,
} from "../../constants/domain-statuses";
import { makeEncryptedColumnTransformer } from "../../encryption/encryption.helper";
import { OrganizationMember } from "./organization-member.entity";
import { User } from "./user.entity";

@Entity("organizations")
export class Organization {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({
    transformer: makeEncryptedColumnTransformer("organizations.name"),
  })
  name: string;

  @Column({ type: "uuid" })
  @Index({ unique: true })
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
    comment:
      "Volume tier entitlement ID from RevenueCat (starter|growth|enterprise)",
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

  @Column({
    type: "varchar",
    default: ORG_PLAN_STATUS.UNPAID,
    comment: "Plan state: unpaid | trial | active | expired",
  })
  planStatus: OrgPlanStatus;

  @Column({
    type: "timestamp",
    nullable: true,
    comment: "When the free trial ends (meaningful while planStatus='trial')",
  })
  trialEndsAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
