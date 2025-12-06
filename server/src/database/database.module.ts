import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserContext } from './entities/user-context.entity';
import { PrivateNote } from './entities/private-note.entity';
import { Email } from './entities/email.entity';
import { EmailThread } from './entities/email-thread.entity';
import { ScanEmail } from './entities/scan-email.entity';
import { DatabaseCleanupService } from './database-cleanup.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserContext, PrivateNote, Email, EmailThread, ScanEmail]),
  ],
  providers: [DatabaseCleanupService],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

