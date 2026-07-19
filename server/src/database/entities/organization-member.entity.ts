import { Exclude } from "class-transformer";
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

import {
  makeEmailTransformer,
  makeEncryptedColumnTransformer,
} from "../../encryption/encryption.helper";
import { Organization } from "./organization.entity";
import { User } from "./user.entity";

export type OrgRole = "owner" | "admin" | "member";
export type OrgMemberStatus = "pending" | "active" | "deactivated";

@Entity("organization_members")
@Index(["organizationId", "emailHash"])
@Index(["organizationId", "status"])
@Index(["inviteToken"], { where: '"inviteToken" IS NOT NULL' })
export class OrganizationMember {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  organizationId: string;

  @ManyToOne(() => Organization, (org) => org.members, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  /**
   * Null until the invite is accepted (pending members may not have a user account yet).
   */
  @Column({ type: "uuid", nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "userId" })
  user: User | null;

  /**
   * Encrypted email address for pending/active members (required for invite dispatch).
   */
  @Column({ transformer: makeEmailTransformer("organization_members.email") })
  email: string;

  /**
   * SHA-256 hash of the email (lowercase) for fast lookups without decryption.
   */
  @Column()
  emailHash: string;

  @Column({
    type: "varchar",
    default: "member",
    comment: "owner | admin | member",
  })
  role: OrgRole;

  @Column({
    type: "varchar",
    default: "pending",
    comment: "pending | active | deactivated",
  })
  status: OrgMemberStatus;

  /**
   * Encrypted first/display name of the invited person, if known at invite time.
   * Populated from User.name once the invite is accepted.
   */
  @Column({
    nullable: true,
    transformer: makeEncryptedColumnTransformer(
      "organization_members.displayName",
    ),
  })
  displayName: string | null;

  /**
   * 32-byte crypto-random hex token sent in the invite email.
   * Cleared on acceptance.
   * Never exposed in API responses — excluded from serialization.
   */
  @Exclude()
  @Column({ nullable: true })
  inviteToken: string | null;

  @Column({ nullable: true })
  inviteExpires: Date | null;

  @Column({ type: "uuid" })
  invitedBy: string;

  @ManyToOne(() => User, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "invitedBy" })
  invitedByUser: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
