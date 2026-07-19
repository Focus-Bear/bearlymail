import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { Contact } from "./contact.entity";
import { ContactGroup } from "./contact-group.entity";

@Entity("contact_group_member")
@Index(["groupId", "contactId"], { unique: true })
export class ContactGroupMember {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  groupId: string;

  @Column()
  contactId: string;

  @CreateDateColumn()
  addedAt: Date;

  @ManyToOne(() => ContactGroup, (group) => group.members, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "groupId" })
  group: ContactGroup;

  @ManyToOne(() => Contact, { onDelete: "CASCADE", eager: false })
  @JoinColumn({ name: "contactId" })
  contact: Contact;
}
