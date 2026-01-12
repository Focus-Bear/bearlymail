import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from "typeorm";
import {
  encryptedColumnTransformer,
  emailTransformer,
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

  @Column({ transformer: emailTransformer, comment: "Encrypted actual email" })
  email: string;

  @Column({ transformer: encryptedColumnTransformer })
  firstName: string;

  @Column("text", { transformer: encryptedColumnTransformer })
  reason: string;

  @Column({ default: false })
  approved: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
