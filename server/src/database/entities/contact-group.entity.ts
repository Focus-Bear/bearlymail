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

import { makeEncryptedColumnTransformer } from "../../encryption/encryption.helper";
import { ContactGroupMember } from "./contact-group-member.entity";
import { User } from "./user.entity";

@Entity("contact_group")
@Index(["userId"])
export class ContactGroup {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({
    transformer: makeEncryptedColumnTransformer("contact_group.name"),
  })
  name: string;

  @Column({
    comment: "Blind index (SHA-256 hash of normalised name) for search",
  })
  nameHash: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @OneToMany(() => ContactGroupMember, (member) => member.group, {
    cascade: true,
    eager: false,
  })
  members: ContactGroupMember[];
}
