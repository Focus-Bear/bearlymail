import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("prompt_examples")
export class PromptExampleEntity {
  @PrimaryColumn({ type: "varchar", length: 100 })
  operation: string;

  @Column({ type: "int", default: 0 })
  promptTokens: number;

  @Column({ type: "text" })
  promptText: string;

  @Column({ type: "text", nullable: true })
  systemPromptText: string | null;

  @Column({ type: "boolean", default: false })
  containsHtml: boolean;

  @Column({ type: "varchar", length: 50 })
  provider: string;

  @Column({ type: "varchar", length: 100 })
  model: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  capturedAt: Date;
}
