import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('private_notes')
export class PrivateNote {
  @PrimaryGeneratedColumn()
  noteId: number;

  @Column()
  userId: number;

  @Column()
  emailThreadId: string;

  @Column('text')
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.notes)
  @JoinColumn({ name: 'userId' })
  user: User;
}

