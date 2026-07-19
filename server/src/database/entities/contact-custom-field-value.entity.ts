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

import { makeEncryptedColumnTransformer } from "../../encryption/encryption.helper";
import { Contact } from "./contact.entity";
import { ContactCustomField } from "./contact-custom-field.entity";

@Entity("contact_custom_field_values")
@Index(["contactId", "fieldId"], { unique: true })
export class ContactCustomFieldValue {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  contactId: string;

  @Column()
  fieldId: string;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer(
      "contact_custom_field_values.value",
    ),
  })
  value: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Contact, (contact) => contact.customFieldValueEntries, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "contactId" })
  contact: Contact;

  @ManyToOne(() => ContactCustomField, { onDelete: "CASCADE" })
  @JoinColumn({ name: "fieldId" })
  field: ContactCustomField;
}
