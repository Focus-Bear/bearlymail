import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

import {
  makeEmailTransformer,
  makeEncryptedColumnTransformer,
} from "../../encryption/encryption.helper";

@Entity("waitlist")
export class Waitlist {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({
    unique: true,
    comment: "SHA-256 hash for querying (not encrypted)",
  })
  @Index()
  emailHash: string;

  @Column({
    transformer: makeEmailTransformer("waitlist.email"),
    comment: "Encrypted actual email",
  })
  email: string;

  @Column({ transformer: makeEncryptedColumnTransformer("waitlist.firstName") })
  firstName: string;

  @Column("text", {
    transformer: makeEncryptedColumnTransformer("waitlist.reason"),
  })
  reason: string;

  @Column({
    nullable: true,
    transformer: makeEncryptedColumnTransformer("waitlist.emailSystem"),
  })
  emailSystem: string;

  @Column({
    nullable: true,
    transformer: makeEncryptedColumnTransformer("waitlist.emailSystemOther"),
  })
  emailSystemOther: string;

  @Column({ default: false })
  approved: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
