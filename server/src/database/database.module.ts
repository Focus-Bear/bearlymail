import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { PriorityRule } from './entities/priority-rule.entity';
import { UserContext } from './entities/user-context.entity';
import { PrivateNote } from './entities/private-note.entity';
import { Email } from './entities/email.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PriorityRule, UserContext, PrivateNote, Email]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

