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

import { encryptedColumnTransformer } from "../../encryption/encryption.helper";
import { Contact } from "./contact.entity";

@Entity("contact_notes")
@Index(["contactId"])
export class ContactNote {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  contactId: string;

  @Column({ transformer: encryptedColumnTransformer })
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Contact, (contact) => contact.notes, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "contactId" })
  contact: Contact;
}
