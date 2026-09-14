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
import { makeGlobalEncryptedColumnTransformer } from "../../encryption/encryption.helper";
import { OrganizationMember } from "./organization-member.entity";
import { User } from "./user.entity";

@Entity("organizations")
export class Organization {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /**
   * GLOBAL key, not the per-user key: an organization is shared data, read by
   * every member and by unauthenticated paths (the OAuth callback provisions
   * the personal org before any interceptor has put a key in ALS). Under the
   * per-user transformer the value was encrypted with whichever key happened to
   * be in ALS at write time and decrypted with whichever happened to be there at
   * read time, so the two rarely matched — the source of the recurring
   * `organizations.name userKey=absent` decrypt failures.
   */
  @Column({
    transformer: makeGlobalEncryptedColumnTransformer("organizations.name"),
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
