import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { encryptedColumnTransformer } from "../../encryption/encryption.helper";
import { User } from "./user.entity";

@Entity("private_notes")
export class PrivateNote {
  @PrimaryGeneratedColumn("uuid")
  noteId: string;

  @Column()
  userId: string;

  @Column()
  emailThreadId: string;

  @Column("text", { transformer: encryptedColumnTransformer })
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.notes, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
